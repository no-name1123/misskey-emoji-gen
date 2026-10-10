import { crc32 } from './crc32.js';

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const DISPOSE_OP_NONE = 0;
const BLEND_OP_SOURCE = 0;

function u32(value) {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function u16(value) {
  return Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
}

function concat(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function chunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const crc = crc32(data, crc32(typeBytes));
  return concat([u32(data.length), typeBytes, data, u32(crc)]);
}

function frameControl(sequence, width, height, delayMs) {
  return chunk('fcTL', concat([
    u32(sequence),
    u32(width),
    u32(height),
    u32(0),
    u32(0),
    u16(delayMs),
    u16(1000),
    Uint8Array.of(DISPOSE_OP_NONE, BLEND_OP_SOURCE),
  ]));
}

// 各行の先頭にフィルター種別 0(None)を付ける。実装を単純に保つため適応フィルターは使わない。
function addFilterBytes(rgba, width, height) {
  const stride = width * 4;
  const out = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    out[y * (stride + 1)] = 0;
    out.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return out;
}

/**
 * フレーム列から無限ループの APNG を作る(詳細設計 2.11)。
 * 各フレームは画像全体を blend_op = SOURCE で置き換えるため、透明部分に前のフレームが残らない。
 * @param {Uint8Array[]|Uint8ClampedArray[]} frames RGBA の画素列(各 width × height × 4 バイト)
 * @param {number} width
 * @param {number} height
 * @param {number} delayMs 1 フレームの表示時間
 * @param {(data: Uint8Array) => Promise<Uint8Array>} deflate zlib 形式で圧縮する関数
 * @returns {Promise<Uint8Array>}
 */
export async function encodeApng(frames, width, height, delayMs, deflate) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('frames must contain at least one frame');
  }
  for (const f of frames) {
    if (!f || f.length !== width * height * 4) {
      throw new Error('frame size does not match width × height × 4');
    }
  }

  const parts = [SIGNATURE];
  parts.push(chunk('IHDR', concat([u32(width), u32(height), Uint8Array.of(8, 6, 0, 0, 0)])));
  parts.push(chunk('acTL', concat([u32(frames.length), u32(0)])));

  let sequence = 0;
  for (let i = 0; i < frames.length; i++) {
    const pixels = frames[i] instanceof Uint8Array ? frames[i] : new Uint8Array(frames[i].buffer, frames[i].byteOffset, frames[i].length);
    const compressed = await deflate(addFilterBytes(pixels, width, height));
    parts.push(frameControl(sequence++, width, height, delayMs));
    if (i === 0) {
      parts.push(chunk('IDAT', compressed));
    } else {
      parts.push(chunk('fdAT', concat([u32(sequence++), compressed])));
    }
  }
  parts.push(chunk('IEND', new Uint8Array(0)));
  return concat(parts);
}
