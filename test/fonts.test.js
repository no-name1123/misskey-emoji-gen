import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ConfigError, detectFontFormat, findMissingGlyphs, loadConfig, validateConfig } from '../js/core/fonts.js';

const validConfig = () => ({
  version: 1,
  defaultFontId: 'a',
  sizeWarningBytes: 1048576,
  blankFont: { file: 'fonts/AdobeBlank2.woff2', licenseFile: 'fonts/AdobeBlank2-OFL.txt' },
  fonts: [
    { id: 'a', name: 'A', category: '丸ゴシック', file: 'fonts/a.woff2', weightLabel: 'Bold', license: 'OFL-1.1', licenseFile: 'fonts/a.txt', bytes: 100 },
    { id: 'b', name: 'B', category: '明朝', file: 'fonts/b.woff2', weightLabel: 'Regular', license: 'Apache-2.0', licenseFile: 'fonts/b.txt', bytes: 200 },
  ],
});

test('validateConfig:正しい例はエラーなし', () => {
  assert.deepEqual(validateConfig(validConfig()), []);
});

test('validateConfig:リポジトリの config.json は正しい', () => {
  const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateConfig(config), []);
});

test('validateConfig:必須項目の欠落', () => {
  for (const key of ['version', 'defaultFontId', 'sizeWarningBytes', 'blankFont', 'fonts']) {
    const c = validConfig();
    delete c[key];
    assert.ok(validateConfig(c).length > 0, key);
  }
  for (const key of ['id', 'name', 'category', 'file', 'weightLabel', 'license', 'licenseFile', 'bytes']) {
    const c = validConfig();
    delete c.fonts[0][key];
    assert.ok(validateConfig(c).some((e) => e.startsWith(`fonts[0].${key}`)), key);
  }
  assert.ok(validateConfig(null).length > 0);
  assert.ok(validateConfig({ ...validConfig(), fonts: [] }).length > 0);
});

test('validateConfig:id の重複・defaultFontId の不一致・ライセンス', () => {
  const dup = validConfig();
  dup.fonts[1].id = 'a';
  assert.ok(validateConfig(dup).includes('fonts[1].id: duplicated'));
  assert.ok(validateConfig({ ...validConfig(), defaultFontId: 'z' }).some((e) => e.startsWith('defaultFontId')));
  const lic = validConfig();
  lic.fonts[0].license = 'MIT';
  assert.ok(validateConfig(lic).some((e) => e.startsWith('fonts[0].license')));
  const bytes = validConfig();
  bytes.fonts[0].bytes = 0;
  assert.ok(validateConfig(bytes).some((e) => e.startsWith('fonts[0].bytes')));
});

test('validateConfig:fonts/ の外や .. を含むパスはエラー', () => {
  for (const file of ['../a.woff2', 'fonts/../a.woff2', 'other/a.woff2', 'fonts/a.ttf']) {
    const c = validConfig();
    c.fonts[0].file = file;
    assert.ok(validateConfig(c).some((e) => e.startsWith('fonts[0].file')), file);
  }
  const c = validConfig();
  c.blankFont.file = '/etc/passwd';
  assert.ok(validateConfig(c).some((e) => e.startsWith('blankFont.file')));
});

test('detectFontFormat', () => {
  const bytes = (...b) => Uint8Array.from(b);
  const ascii = (s) => new TextEncoder().encode(s);
  assert.equal(detectFontFormat(bytes(0, 1, 0, 0)), 'ttf');
  assert.equal(detectFontFormat(ascii('true')), 'ttf');
  assert.equal(detectFontFormat(ascii('OTTO')), 'otf');
  assert.equal(detectFontFormat(ascii('wOFF')), 'woff');
  assert.equal(detectFontFormat(ascii('wOF2')), 'woff2');
  assert.equal(detectFontFormat(ascii('ttcf')), null);
  assert.equal(detectFontFormat(ascii('GIF8')), null);
  for (let n = 0; n < 4; n++) assert.equal(detectFontFormat(new Uint8Array(n)), null);
});

test('findMissingGlyphs:幅 0 の文字だけを、出てきた順に重複なく返す', () => {
  const missing = new Set(['☃', '𠮷']);
  const calls = [];
  const measureWidth = (font, ch) => {
    calls.push(font);
    return missing.has(ch) ? 0 : 100;
  };
  assert.deepEqual(findMissingGlyphs(['草 ☃', '𠮷☃草', ''], 'meg-a', measureWidth), ['☃', '𠮷']);
  assert.ok(calls.every((f) => f === '100px "meg-a", "meg-blank"'));
  assert.equal(calls.length, 3);
});

const jsonResponse = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

test('loadConfig:成功', async () => {
  const config = await loadConfig({ fetchFn: async () => jsonResponse(validConfig()) });
  assert.equal(config.defaultFontId, 'a');
});

test('loadConfig:HTTP エラー・解析エラー・形式誤り・通信エラー', async () => {
  const kinds = async (fetchFn) => {
    try {
      await loadConfig({ fetchFn });
      return 'none';
    } catch (e) {
      assert.ok(e instanceof ConfigError);
      return e.kind;
    }
  };
  assert.equal(await kinds(async () => jsonResponse(null, false, 404)), 'http');
  assert.equal(await kinds(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } })), 'parse');
  assert.equal(await kinds(async () => jsonResponse({ version: 2 })), 'invalid');
  assert.equal(await kinds(async () => { throw new TypeError('failed'); }), 'network');
});

test('loadConfig:時間切れ', async () => {
  const neverResolves = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  await assert.rejects(loadConfig({ fetchFn: neverResolves, timeoutMs: 10 }), (e) => e.kind === 'timeout');
});

test('loadConfig:引数なしでも TypeError にならない', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(validConfig());
  try {
    const config = await loadConfig();
    assert.equal(config.version, 1);
  } finally {
    globalThis.fetch = original;
  }
});
