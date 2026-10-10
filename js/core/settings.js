import { splitGraphemes } from './fonts.js';

export const MAX_LINES = 4;
export const MAX_CHARS = 20;
export const MAX_FILE_NAME = 64;
export const DEFAULT_FILE_NAME = 'emoji';

/** 絵文字設定の既定値。`font` は起動時に config の既定フォントで決める */
export const DEFAULT_SETTINGS = Object.freeze({
  text: '了解',
  align: 'center',
  fill: Object.freeze({ type: 'solid', color1: '#e53935', color2: '#fb8c00', direction: 'vertical' }),
  background: Object.freeze({ type: 'transparent', color: '#ffffff' }),
  outline: Object.freeze({ enabled: true, color: '#ffffff', width: 6 }),
  shadow: Object.freeze({ enabled: false, color: '#000000', dx: 3, dy: 3, blur: 2 }),
  motion: 'none',
  speed: 'normal',
  format: 'apng',
});

/**
 * 絵文字にする文字を検証する。
 * @param {string} raw
 * @returns {{ ok: boolean, lines: string[], count: number, error?: 'empty'|'too_many_lines'|'too_many_chars' }}
 */
export function validateText(raw) {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const count = splitGraphemes(lines.join('')).length;

  let error;
  if (/^\s*$/u.test(lines.join(''))) error = 'empty';
  else if (lines.length > MAX_LINES) error = 'too_many_lines';
  else if (count > MAX_CHARS) error = 'too_many_chars';
  return error ? { ok: false, lines, count, error } : { ok: true, lines, count };
}

/**
 * 保存するファイル名(拡張子を除く)を検証する。
 * @param {string} raw
 * @returns {{ ok: boolean, fileName?: string, error?: 'too_long'|'invalid_chars' }}
 */
export function validateFileName(raw) {
  if (raw === '') return { ok: true, fileName: DEFAULT_FILE_NAME };
  if (raw.length > MAX_FILE_NAME) return { ok: false, error: 'too_long' };
  if (!/^[a-zA-Z0-9_]+$/.test(raw)) return { ok: false, error: 'invalid_chars' };
  return { ok: true, fileName: raw };
}

/**
 * @param {string} raw
 * @returns {{ ok: true, value: string } | { ok: false }}
 */
export function validateHexColor(raw) {
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) return { ok: false };
  return { ok: true, value: raw.toLowerCase() };
}

/**
 * 数値入力欄の値を整数にする。空欄や数でない値は fallback(直前の正しい値)を返す。
 * @param {string} raw
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
export function parseIntInput(raw, min, max, fallback) {
  const trimmed = String(raw).trim();
  // Number('') は 0 になるため、空文字列を先に除く
  if (trimmed === '') return fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * レイアウトの計算し直しが必要かを判断するキー。
 * @param {object} settings EMOJI_SETTINGS
 * @param {string} family 使用中のフォントの登録名
 * @param {string} fontState 使用中のフォントの読み込み状態
 * @returns {string}
 */
export function layoutKey(settings, family, fontState) {
  return JSON.stringify([
    family,
    fontState,
    validateText(settings.text).lines,
    settings.align,
    settings.outline.enabled,
    settings.outline.width,
    settings.shadow.enabled,
    settings.shadow.dx,
    settings.shadow.dy,
    settings.shadow.blur,
    settings.motion,
  ]);
}

/**
 * 保存用ファイルの作り直しが必要かを判断するキー。ファイル名は含めない。
 * @param {object} settings EMOJI_SETTINGS
 * @param {string} family
 * @param {string} fontState
 * @returns {string}
 */
export function renderKey(settings, family, fontState) {
  const { fill, background, outline, shadow } = settings;
  return JSON.stringify([
    settings.text,
    settings.align,
    family,
    fontState,
    fill.type,
    fill.color1,
    fill.color2,
    fill.direction,
    background.type,
    background.color,
    outline.enabled,
    outline.color,
    outline.width,
    shadow.enabled,
    shadow.color,
    shadow.dx,
    shadow.dy,
    shadow.blur,
    settings.motion,
    settings.speed,
    settings.format,
  ]);
}
