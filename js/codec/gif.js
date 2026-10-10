const MAX_COLORS = 255;
const TRANSPARENT_INDEX = 0;
const ALPHA_THRESHOLD = 128;
const MAX_CODE = 4096;
const MAX_CODE_SIZE = 12;

const packRgb = (r, g, b) => (r << 16) | (g << 8) | b;
const channel = (rgb, c) => (rgb >> (16 - c * 8)) & 0xff;

function countOpaqueColors(frames) {
  const counts = new Map();
  for (const f of frames) {
    for (let i = 0; i < f.length; i += 4) {
      if (f[i + 3] < ALPHA_THRESHOLD) continue;
      const rgb = packRgb(f[i], f[i + 1], f[i + 2]);
      counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
    }
  }
  return counts;
}

function widestChannel(colors) {
  let best = { channel: 0, range: -1 };
  for (let c = 0; c < 3; c++) {
    let min = 255;
    let max = 0;
    for (const { rgb } of colors) {
      const v = channel(rgb, c);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // 同じ幅なら R、G、B の順で先のものを採る(詳細設計 2.11)
    if (max - min > best.range) best = { channel: c, range: max - min };
  }
  return best;
}

function splitBox(colors, c) {
  const sorted = [...colors].sort((a, b) => channel(a.rgb, c) - channel(b.rgb, c) || a.rgb - b.rgb);
  const total = sorted.reduce((sum, x) => sum + x.count, 0);
  let acc = 0;
  let k = 0;
  for (; k < sorted.length; k++) {
    acc += sorted[k].count;
    if (acc * 2 >= total) break;
  }
  if (k >= sorted.length - 1) k = sorted.length - 2;
  return [sorted.slice(0, k + 1), sorted.slice(k + 1)];
}

function averageColor(colors) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const { rgb, count } of colors) {
    r += channel(rgb, 0) * count;
    g += channel(rgb, 1) * count;
    b += channel(rgb, 2) * count;
    n += count;
  }
  return packRgb(Math.round(r / n), Math.round(g / n), Math.round(b / n));
}

/**
 * 全フレームの不透明な画素から 255 色以下の色表を作る(重み付きメディアンカット法。詳細設計 2.11)。
 * @param {Uint8Array[]|Uint8ClampedArray[]} frames RGBA の画素列
 * @returns {number[]} 0xRRGGBB の配列(1〜255 色)
 */
export function quantize(frames) {
  const counts = countOpaqueColors(frames);
  if (counts.size === 0) return [0];
  if (counts.size <= MAX_COLORS) return [...counts.keys()].sort((a, b) => a - b);

  const boxes = [[...counts].map(([rgb, count]) => ({ rgb, count }))];
  while (boxes.length < MAX_COLORS) {
    let target = -1;
    let targetChannel = 0;
    let targetRange = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const { channel: c, range } = widestChannel(boxes[i]);
      if (range > targetRange) {
        target = i;
        targetChannel = c;
        targetRange = range;
      }
    }
    if (target < 0) break;
    const [low, high] = splitBox(boxes[target], targetChannel);
    boxes[target] = low;
    boxes.push(high);
  }
  return boxes.map(averageColor);
}

function nearestIndex(palette, rgb) {
  const r = channel(rgb, 0);
  const g = channel(rgb, 1);
  const b = channel(rgb, 2);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = channel(palette[i], 0) - r;
    const dg = channel(palette[i], 1) - g;
    const db = channel(palette[i], 2) - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function toIndices(frame, palette, cache) {
  const indices = new Uint8Array(frame.length / 4);
  for (let p = 0, i = 0; i < frame.length; p++, i += 4) {
    if (frame[i + 3] < ALPHA_THRESHOLD) {
      indices[p] = TRANSPARENT_INDEX;
      continue;
    }
    const rgb = packRgb(frame[i], frame[i + 1], frame[i + 2]);
    let index = cache.get(rgb);
    if (index === undefined) {
      index = nearestIndex(palette, rgb) + 1;
      cache.set(rgb, index);
    }
    indices[p] = index;
  }
  return indices;
}

/**
 * GIF の LZW 圧縮(サブブロックに分ける前のバイト列)。
 * 符号長は「直前に割り当てた符号が 2^size に等しくなったとき」に増やす(詳細設計 2.11。Pillow で復号を確認した規則)。
 * @param {ArrayLike<number>} indices 色番号の列
 * @param {number} [minCodeSize]
 * @returns {Uint8Array}
 */
export function lzwEncode(indices, minCodeSize = 8) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const out = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (code, size) => {
    bitBuffer |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  // 辞書は「列の符号 × 256 + 次の番号」をキーにして列を表す
  let dict = new Map();
  let next = endCode + 1;
  let size = minCodeSize + 1;
  emit(clearCode, size);

  if (indices.length === 0) {
    emit(endCode, size);
    if (bitCount > 0) out.push(bitBuffer & 0xff);
    return Uint8Array.from(out);
  }

  let w = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = w * 256 + k;
    const found = dict.get(key);
    if (found !== undefined) {
      w = found;
      continue;
    }
    emit(w, size);
    dict.set(key, next++);
    if (next > 1 << size && size < MAX_CODE_SIZE) size++;
    if (next === MAX_CODE) {
      emit(clearCode, size);
      dict = new Map();
      next = endCode + 1;
      size = minCodeSize + 1;
    }
    w = k;
  }
  emit(w, size);
  emit(endCode, size);
  if (bitCount > 0) out.push(bitBuffer & 0xff);
  return Uint8Array.from(out);
}

function subBlocks(data) {
  const out = [];
  for (let i = 0; i < data.length; i += 255) {
    const block = data.subarray(i, i + 255);
    out.push(block.length, ...block);
  }
  out.push(0);
  return out;
}

const le16 = (v) => [v & 0xff, (v >> 8) & 0xff];

/**
 * フレーム列から無限ループの GIF を作る(詳細設計 2.11)。
 * 色番号 0 を透明に使い、各フレームは表示前に背景に戻す(消去方法 2)。
 * @param {Uint8Array[]|Uint8ClampedArray[]} frames RGBA の画素列
 * @param {number} width
 * @param {number} height
 * @param {number} delayMs
 * @returns {Uint8Array}
 */
export function encodeGif(frames, width, height, delayMs) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('frames must contain at least one frame');
  }
  for (const f of frames) {
    if (!f || f.length !== width * height * 4) {
      throw new Error('frame size does not match width × height × 4');
    }
  }

  const palette = quantize(frames);
  const bytes = [];
  bytes.push(...new TextEncoder().encode('GIF89a'));
  bytes.push(...le16(width), ...le16(height), 0xf7, TRANSPARENT_INDEX, 0);
  const table = new Array(256 * 3).fill(0);
  palette.forEach((rgb, i) => {
    table[(i + 1) * 3] = channel(rgb, 0);
    table[(i + 1) * 3 + 1] = channel(rgb, 1);
    table[(i + 1) * 3 + 2] = channel(rgb, 2);
  });
  bytes.push(...table);
  bytes.push(0x21, 0xff, 0x0b, ...new TextEncoder().encode('NETSCAPE2.0'), 0x03, 0x01, 0x00, 0x00, 0x00);

  const delay = Math.round(delayMs / 10);
  const cache = new Map();
  const chunks = [Uint8Array.from(bytes)];
  for (const frame of frames) {
    const header = [
      0x21, 0xf9, 0x04, (2 << 2) | 1, ...le16(delay), TRANSPARENT_INDEX, 0x00,
      0x2c, 0, 0, 0, 0, ...le16(width), ...le16(height), 0x00,
      8,
    ];
    chunks.push(Uint8Array.from(header));
    chunks.push(Uint8Array.from(subBlocks(lzwEncode(toIndices(frame, palette, cache), 8))));
  }
  chunks.push(Uint8Array.of(0x3b));

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
