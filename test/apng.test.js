import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { encodeApng } from '../js/codec/apng.js';
import { crc32 } from '../js/codec/crc32.js';

const deflate = async (data) => new Uint8Array(deflateSync(data));

function readChunks(png) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = view.getUint32(offset + 8 + length);
    chunks.push({ type, data, crc, typeAndData: png.subarray(offset + 4, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

function makeFrame(width, height, seed) {
  const f = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < f.length; i++) f[i] = (i * 31 + seed * 7) & 0xff;
  return f;
}

function withFilterBytes(rgba, width, height) {
  const stride = width * 4;
  const out = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) out.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return out;
}

const W = 3;
const H = 2;
const frames = [makeFrame(W, H, 1), makeFrame(W, H, 2)];

test('シグネチャとチャンクの並びが仕様どおり', async () => {
  const png = await encodeApng(frames, W, H, 50, deflate);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const types = readChunks(png).map((c) => c.type);
  assert.deepEqual(types, ['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'IEND']);
});

test('各チャンクの CRC が正しい', async () => {
  const png = await encodeApng(frames, W, H, 50, deflate);
  for (const c of readChunks(png)) {
    assert.equal(c.crc, crc32(c.typeAndData), c.type);
  }
});

test('IHDR は RGBA 8 ビット・インターレースなし', async () => {
  const png = await encodeApng(frames, W, H, 50, deflate);
  const ihdr = readChunks(png)[0].data;
  const view = new DataView(ihdr.buffer, ihdr.byteOffset);
  assert.equal(view.getUint32(0), W);
  assert.equal(view.getUint32(4), H);
  assert.deepEqual([...ihdr.subarray(8)], [8, 6, 0, 0, 0]);
});

test('acTL のフレーム数とループ回数 0', async () => {
  const png = await encodeApng(frames, W, H, 50, deflate);
  const actl = readChunks(png)[1].data;
  const view = new DataView(actl.buffer, actl.byteOffset);
  assert.equal(view.getUint32(0), 2);
  assert.equal(view.getUint32(4), 0);
});

test('fcTL の連番・大きさ・遅延・dispose・blend', async () => {
  const png = await encodeApng(frames, W, H, 50, deflate);
  const chunks = readChunks(png);
  const fctls = chunks.filter((c) => c.type === 'fcTL');
  const fdat = chunks.find((c) => c.type === 'fdAT');
  const seqs = fctls.map((c) => new DataView(c.data.buffer, c.data.byteOffset).getUint32(0));
  assert.deepEqual(seqs, [0, 1]);
  assert.equal(new DataView(fdat.data.buffer, fdat.data.byteOffset).getUint32(0), 2);
  for (const c of fctls) {
    const v = new DataView(c.data.buffer, c.data.byteOffset);
    assert.equal(v.getUint32(4), W);
    assert.equal(v.getUint32(8), H);
    assert.equal(v.getUint32(12), 0);
    assert.equal(v.getUint32(16), 0);
    assert.equal(v.getUint16(20), 50);
    assert.equal(v.getUint16(22), 1000);
    assert.equal(c.data[24], 0);
    assert.equal(c.data[25], 0);
  }
});

test('IDAT・fdAT を展開すると入力の画素(フィルター 0 付き)に一致する', async () => {
  const png = await encodeApng(frames, W, H, 50, deflate);
  const chunks = readChunks(png);
  const idat = chunks.find((c) => c.type === 'IDAT');
  const fdat = chunks.find((c) => c.type === 'fdAT');
  assert.deepEqual(new Uint8Array(inflateSync(idat.data)), withFilterBytes(new Uint8Array(frames[0].buffer), W, H));
  assert.deepEqual(new Uint8Array(inflateSync(fdat.data.subarray(4))), withFilterBytes(new Uint8Array(frames[1].buffer), W, H));
});

test('1 フレームだけでも作れる', async () => {
  const png = await encodeApng([frames[0]], W, H, 50, deflate);
  assert.deepEqual(readChunks(png).map((c) => c.type), ['IHDR', 'acTL', 'fcTL', 'IDAT', 'IEND']);
});

test('不正な引数で例外になる', async () => {
  await assert.rejects(encodeApng([], W, H, 50, deflate));
  await assert.rejects(encodeApng([new Uint8ClampedArray(5)], W, H, 50, deflate));
  await assert.rejects(encodeApng(null, W, H, 50, deflate));
});
