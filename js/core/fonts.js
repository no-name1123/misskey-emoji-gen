export const MAX_LOCAL_FONT_BYTES = 20 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 30000;
export const FONT_FAMILY_PREFIX = 'meg-';
export const BLANK_FAMILY = 'meg-blank';

const LICENSES = ['OFL-1.1', 'Apache-2.0'];
const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });

/** 設定ファイルの取得失敗。kind は 'network' | 'timeout' | 'http' | 'parse' | 'invalid' */
export class ConfigError extends Error {
  constructor(kind, detail) {
    super(`config error: ${kind}${detail ? ` (${detail})` : ''}`);
    this.name = 'ConfigError';
    this.kind = kind;
  }
}

/** Web フォント・空白フォントの取得失敗。kind は 'network' | 'timeout' | 'http' | 'decode' */
export class FontLoadError extends Error {
  constructor(kind) {
    super(`font load error: ${kind}`);
    this.name = 'FontLoadError';
    this.kind = kind;
  }
}

/** 手持ちフォントの読み込み失敗。kind は 'too_large' | 'unsupported' | 'broken' */
export class LocalFontError extends Error {
  constructor(kind) {
    super(`local font error: ${kind}`);
    this.name = 'LocalFontError';
    this.kind = kind;
  }
}

/**
 * 文字列を見た目の 1 文字(書記素)ごとに分ける。
 * @param {string} text
 * @returns {string[]}
 */
export function splitGraphemes(text) {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

const isSafeFontPath = (p) => typeof p === 'string' && p.startsWith('fonts/') && !p.includes('..');
const isText = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;
const isPositiveInt = (v) => Number.isInteger(v) && v >= 1;

/**
 * config.json の内容を検査する。
 * @param {unknown} obj
 * @returns {string[]} エラーの一覧(空なら正しい)
 */
export function validateConfig(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ['config: not an object'];
  if (obj.version !== 1) errors.push('version: must be 1');
  if (!isPositiveInt(obj.sizeWarningBytes)) errors.push('sizeWarningBytes: must be a positive integer');
  if (!obj.blankFont || typeof obj.blankFont !== 'object') {
    errors.push('blankFont: missing');
  } else {
    if (!isSafeFontPath(obj.blankFont.file)) errors.push('blankFont.file: invalid path');
    if (!isSafeFontPath(obj.blankFont.licenseFile)) errors.push('blankFont.licenseFile: invalid path');
  }
  if (!Array.isArray(obj.fonts) || obj.fonts.length === 0) {
    errors.push('fonts: must have at least one font');
    return errors;
  }
  const ids = new Set();
  obj.fonts.forEach((f, i) => {
    const at = `fonts[${i}]`;
    if (!f || typeof f !== 'object') {
      errors.push(`${at}: not an object`);
      return;
    }
    if (typeof f.id !== 'string' || !/^[a-z0-9-]{1,32}$/.test(f.id)) errors.push(`${at}.id: invalid`);
    else if (ids.has(f.id)) errors.push(`${at}.id: duplicated`);
    else ids.add(f.id);
    if (!isText(f.name, 1, 50)) errors.push(`${at}.name: invalid`);
    if (!isText(f.category, 1, 20)) errors.push(`${at}.category: invalid`);
    if (!isSafeFontPath(f.file) || !f.file.endsWith('.woff2')) errors.push(`${at}.file: invalid path`);
    if (!isText(f.weightLabel, 1, 20)) errors.push(`${at}.weightLabel: invalid`);
    if (!LICENSES.includes(f.license)) errors.push(`${at}.license: must be OFL-1.1 or Apache-2.0`);
    if (!isSafeFontPath(f.licenseFile)) errors.push(`${at}.licenseFile: invalid path`);
    if (!isPositiveInt(f.bytes)) errors.push(`${at}.bytes: must be a positive integer`);
  });
  if (typeof obj.defaultFontId !== 'string' || !ids.has(obj.defaultFontId)) {
    errors.push('defaultFontId: must be one of fonts[].id');
  }
  return errors;
}

async function fetchWithTimeout(fetchFn, url, timeoutMs, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } catch {
    throw controller.signal.aborted ? 'timeout' : 'network';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * config.json を取得して検査する。
 * @param {{ fetchFn?: typeof fetch, timeoutMs?: number }} [options]
 */
export async function loadConfig({ fetchFn = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  let response;
  try {
    response = await fetchWithTimeout(fetchFn, 'config.json', timeoutMs, { cache: 'no-cache' });
  } catch (kind) {
    throw new ConfigError(kind);
  }
  if (!response.ok) throw new ConfigError('http', String(response.status));
  let obj;
  try {
    obj = await response.json();
  } catch {
    throw new ConfigError('parse');
  }
  const errors = validateConfig(obj);
  if (errors.length > 0) throw new ConfigError('invalid', errors.join('; '));
  return obj;
}

async function fetchFontBuffer(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch {
      throw new FontLoadError(controller.signal.aborted ? 'timeout' : 'network');
    }
    if (!response.ok) throw new FontLoadError('http');
    try {
      return await response.arrayBuffer();
    } catch {
      throw new FontLoadError(controller.signal.aborted ? 'timeout' : 'network');
    }
  } finally {
    clearTimeout(timer);
  }
}

async function registerFont(family, buffer, descriptors) {
  const face = new FontFace(family, buffer, descriptors);
  await face.load();
  document.fonts.add(face);
  return face;
}

const webFontLoads = new Map();

/**
 * Web フォントを丸ごと取得して登録する。同じフォントは一度だけ取得する。
 * @param {{ id: string, file: string }} font
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<string>} 登録名
 */
export function loadWebFont(font, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const cached = webFontLoads.get(font.id);
  if (cached) return cached;
  const family = FONT_FAMILY_PREFIX + font.id;
  const promise = (async () => {
    const buffer = await fetchFontBuffer(font.file, timeoutMs);
    try {
      await registerFont(family, buffer, { weight: '400', style: 'normal' });
    } catch {
      throw new FontLoadError('decode');
    }
    return family;
  })();
  webFontLoads.set(font.id, promise);
  // 失敗したらキャッシュから消し、再試行で取り直せるようにする
  promise.catch(() => webFontLoads.delete(font.id));
  return promise;
}

/**
 * 字形の判定用の空白フォントを登録する。
 * @param {{ file: string }} blankFont
 * @param {{ timeoutMs?: number }} [options]
 */
export async function loadBlankFont(blankFont, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const buffer = await fetchFontBuffer(blankFont.file, timeoutMs);
  try {
    await registerFont(BLANK_FAMILY, buffer);
  } catch {
    throw new FontLoadError('decode');
  }
  return BLANK_FAMILY;
}

/**
 * フォントファイルの先頭 4 バイトから形式を判定する。
 * @param {Uint8Array} bytes
 * @returns {'ttf'|'otf'|'woff'|'woff2'|null}
 */
export function detectFontFormat(bytes) {
  if (!bytes || bytes.length < 4) return null;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if ((bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) || tag === 'true') return 'ttf';
  if (tag === 'OTTO') return 'otf';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  return null;
}

let localSequence = 0;
let currentLocalFace = null;

/**
 * 利用者の手持ちフォントを検査して登録する。ファイルは端末の外へ送らない。
 * @param {File} file
 * @returns {Promise<{ family: string, fileName: string, format: string }>}
 */
export async function loadLocalFont(file) {
  if (file.size > MAX_LOCAL_FONT_BYTES) throw new LocalFontError('too_large');
  const buffer = await file.arrayBuffer();
  const format = detectFontFormat(new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)));
  if (!format) throw new LocalFontError('unsupported');
  localSequence += 1;
  const family = `${FONT_FAMILY_PREFIX}local-${localSequence}`;
  const face = new FontFace(family, buffer);
  try {
    await face.load();
  } catch {
    throw new LocalFontError('broken');
  }
  // 手持ちフォントは常に最新の 1 つだけを登録しておく
  if (currentLocalFace) document.fonts.delete(currentLocalFace);
  document.fonts.add(face);
  currentLocalFace = face;
  return { family, fileName: file.name, format };
}

/**
 * 選んだフォントに字形がない文字を返す。
 * 対象フォントの後ろに空白フォントを指定して幅を測り、幅が 0 の文字を字形がないと判断する。
 * @param {string[]} lines
 * @param {string} family
 * @param {(font: string, text: string) => number} measureWidth
 * @returns {string[]}
 */
export function findMissingGlyphs(lines, family, measureWidth) {
  const font = `100px "${family}", "${BLANK_FAMILY}"`;
  const seen = new Set();
  const missing = [];
  for (const line of lines) {
    for (const ch of splitGraphemes(line)) {
      if (/^\s+$/u.test(ch) || seen.has(ch)) continue;
      seen.add(ch);
      if (measureWidth(font, ch) <= 0.01) missing.push(ch);
    }
  }
  return missing;
}
