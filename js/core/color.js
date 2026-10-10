/**
 * @param {string} hex `#rrggbb`
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(hex) {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) throw new Error(`invalid color: ${hex}`);
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/**
 * `#rrggbb` を HSL にする。値は丸めない(往復で元の色に戻すため)。
 * @param {string} hex
 * @returns {{ h: number, s: number, l: number }} h は 0 以上 360 未満、s・l は 0〜100
 */
export function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

/**
 * @param {number} h 色相(負や 360 以上は 360 で割った余りにする)
 * @param {number} s 彩度 0〜100
 * @param {number} l 明度 0〜100
 * @returns {string} `#rrggbb`(小文字)
 */
export function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = ln - c / 2;
  let rgb;
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return '#' + rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
