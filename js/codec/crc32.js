const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * CRC-32(PNG のチャンクで使う多項式 0xEDB88320)を計算する。
 * `initial` に前回の結果を渡すと、続きのバイト列を連結したものとして計算する。
 * @param {Uint8Array} bytes
 * @param {number} [initial]
 * @returns {number} 符号なし 32 ビット整数
 */
export function crc32(bytes, initial = 0) {
  let c = (initial ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
