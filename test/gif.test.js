import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeGif, lzwEncode, quantize } from '../js/codec/gif.js';

const toHex = (bytes) => Buffer.from(bytes).toString('hex');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// テスト用の LZW 復号(GIF89a 仕様の復号手順)
function lzwDecode(bytes, minCodeSize = 8) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let pos = 0;
  let bitBuffer = 0;
  let bitCount = 0;
  const read = (size) => {
    while (bitCount < size) {
      if (pos >= bytes.length) return null;
      bitBuffer |= bytes[pos++] << bitCount;
      bitCount += 8;
    }
    const code = bitBuffer & ((1 << size) - 1);
    bitBuffer >>>= size;
    bitCount -= size;
    return code;
  };
  const out = [];
  let dict;
  let size;
  let prev = null;
  const reset = () => {
    dict = [];
    for (let i = 0; i < clearCode; i++) dict.push([i]);
    dict.push(null, null);
    size = minCodeSize + 1;
    prev = null;
  };
  reset();
  for (;;) {
    const code = read(size);
    if (code === null) throw new Error('unexpected end');
    if (code === clearCode) {
      reset();
      continue;
    }
    if (code === endCode) break;
    let entry;
    if (code < dict.length) entry = dict[code];
    else if (code === dict.length && prev) entry = [...prev, prev[0]];
    else throw new Error(`bad code ${code}`);
    out.push(...entry);
    if (prev) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === 1 << size && size < 12) size++;
  }
  return out;
}

test('テストベクター:短い列が既知のバイト列になる', () => {
  assert.equal(toHex(lzwEncode([1, 1, 1, 1, 2, 2, 2, 2])), '0003080c20a0a08080');
});

test('テストベクター:16384 個の列が既知の大きさと SHA-256 になる', () => {
  const seq = Array.from({ length: 16384 }, (_, i) => (i * 7 + Math.floor(i / 13)) % 256);
  const out = lzwEncode(seq);
  assert.equal(out.length, 4735);
  assert.equal(sha256(out), '0a714fc27492fef8dbf4f0182d65b93104c3fe0f8a3509a1730c39c90f93d634');
});

test('テストベクター:辞書の初期化を含む列が既知の大きさと SHA-256 になる', () => {
  const seq = Array.from({ length: 16384 }, (_, i) => Math.imul(i, 2654435761) >>> 24);
  const out = lzwEncode(seq);
  assert.equal(out.length, 7362);
  assert.equal(sha256(out), '221387ff7bf7ac2a303be102e2f62598ea78a00cd39a18d9bcb6930a191e480d');
});

test('復号すると元の番号列に戻る', () => {
  const cases = [
    [0],
    [5, 5, 5, 5, 5, 5, 5],
    Array.from({ length: 1000 }, (_, i) => i % 7),
    Array.from({ length: 16384 }, (_, i) => Math.imul(i, 2654435761) >>> 24),
  ];
  for (const seq of cases) {
    assert.deepEqual(lzwDecode(lzwEncode(seq)), seq);
  }
});

function frameFromColors(colors, alpha = 255) {
  const f = new Uint8ClampedArray(colors.length * 4);
  colors.forEach((rgb, i) => {
    f[i * 4] = (rgb >> 16) & 0xff;
    f[i * 4 + 1] = (rgb >> 8) & 0xff;
    f[i * 4 + 2] = rgb & 0xff;
    f[i * 4 + 3] = alpha;
  });
  return f;
}

test('quantize:255 色以下はそのまま昇順で返す', () => {
  const palette = quantize([frameFromColors([0x00ff00, 0xff0000, 0x0000ff, 0xff0000])]);
  assert.deepEqual(palette, [0x0000ff, 0x00ff00, 0xff0000]);
});

test('quantize:256 色以上は 255 色以下になる', () => {
  const colors = Array.from({ length: 4096 }, (_, i) => (i * 4099) & 0xffffff);
  const palette = quantize([frameFromColors(colors)]);
  assert.ok(palette.length <= 255 && palette.length > 1);
});

test('quantize:画素の大半が 1 色でも空の箱ができず 255 色になる', () => {
  const colors = Array.from({ length: 5000 }, (_, i) => (i < 4000 ? 0x123456 : (i * 2654435761) & 0xffffff));
  const palette = quantize([frameFromColors(colors)]);
  assert.equal(palette.length, 255);
  assert.ok(palette.every((c) => Number.isInteger(c) && c >= 0 && c <= 0xffffff));
});

test('quantize:すべて同じ色・完全に透明', () => {
  assert.deepEqual(quantize([frameFromColors([0xabcdef, 0xabcdef])]), [0xabcdef]);
  assert.deepEqual(quantize([frameFromColors([0xabcdef], 0)]), [0]);
});

function parseGif(gif) {
  const blocks = [];
  let p = 13 + 256 * 3;
  while (p < gif.length) {
    const b = gif[p];
    if (b === 0x3b) {
      blocks.push({ type: 'trailer' });
      p++;
    } else if (b === 0x21) {
      const label = gif[p + 1];
      const start = p;
      p += 2;
      const data = [];
      const sizes = [];
      while (gif[p] !== 0) {
        sizes.push(gif[p]);
        data.push(...gif.subarray(p + 1, p + 1 + gif[p]));
        p += gif[p] + 1;
      }
      p++;
      blocks.push({ type: 'ext', label, data, start, sizes });
    } else if (b === 0x2c) {
      const desc = gif.subarray(p, p + 10);
      p += 10;
      const minCodeSize = gif[p++];
      const data = [];
      const sizes = [];
      while (gif[p] !== 0) {
        sizes.push(gif[p]);
        data.push(...gif.subarray(p + 1, p + 1 + gif[p]));
        p += gif[p] + 1;
      }
      p++;
      blocks.push({ type: 'image', desc, minCodeSize, data: Uint8Array.from(data), sizes });
    } else {
      throw new Error(`unexpected byte ${b} at ${p}`);
    }
  }
  return blocks;
}

const W = 128;
const H = 128;

function testFrames() {
  const frames = [];
  for (let n = 0; n < 2; n++) {
    const f = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      f[i * 4] = (i * 3 + n) & 0xff;
      f[i * 4 + 1] = (i >> 7) & 0xff;
      f[i * 4 + 2] = 200;
      f[i * 4 + 3] = i % 10 === 0 ? 0 : i % 10 === 1 ? 127 : 255;
    }
    frames.push(f);
  }
  return frames;
}

test('GIF の構造(ヘッダー・論理画面記述子・ループ・画像制御拡張・トレーラー)', () => {
  const gif = encodeGif(testFrames(), W, H, 50);
  assert.equal(new TextDecoder().decode(gif.subarray(0, 6)), 'GIF89a');
  assert.deepEqual([...gif.subarray(6, 13)], [128, 0, 128, 0, 0xf7, 0, 0]);
  const blocks = parseGif(gif);
  const app = blocks.find((b) => b.type === 'ext' && b.label === 0xff);
  assert.equal(new TextDecoder().decode(Uint8Array.from(app.data.slice(0, 11))), 'NETSCAPE2.0');
  assert.deepEqual(app.data.slice(11), [1, 0, 0]);
  const gces = blocks.filter((b) => b.type === 'ext' && b.label === 0xf9);
  assert.equal(gces.length, 2);
  for (const g of gces) {
    assert.equal((g.data[0] >> 2) & 0x7, 2);
    assert.equal(g.data[0] & 1, 1);
    assert.equal(g.data[1] | (g.data[2] << 8), 5);
    assert.equal(g.data[3], 0);
  }
  assert.equal(blocks.filter((b) => b.type === 'image').length, 2);
  assert.equal(blocks.at(-1).type, 'trailer');
});

test('GIF の画像データ:透明画素が番号 0、サブブロックが 255 バイト以下', () => {
  const frames = testFrames();
  const gif = encodeGif(frames, W, H, 50);
  const images = parseGif(gif).filter((b) => b.type === 'image');
  for (let n = 0; n < images.length; n++) {
    const img = images[n];
    assert.equal(img.minCodeSize, 8);
    assert.ok(img.sizes.every((s) => s >= 1 && s <= 255));
    const indices = lzwDecode(img.data);
    assert.equal(indices.length, W * H);
    for (let i = 0; i < W * H; i++) {
      const transparent = frames[n][i * 4 + 3] < 128;
      assert.equal(indices[i] === 0, transparent, `pixel ${i}`);
    }
  }
});

test('GIF:不正な引数で例外になる', () => {
  assert.throws(() => encodeGif([], W, H, 50));
  assert.throws(() => encodeGif([new Uint8ClampedArray(3)], W, H, 50));
});
