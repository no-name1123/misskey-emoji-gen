import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  layoutKey,
  parseIntInput,
  renderKey,
  validateFileName,
  validateHexColor,
  validateText,
} from '../js/core/settings.js';

test('validateText:空・空白のみは empty', () => {
  assert.equal(validateText('').error, 'empty');
  assert.equal(validateText(' \n　 ').error, 'empty');
});

test('validateText:5 行は too_many_lines、4 行は ok', () => {
  assert.equal(validateText('a\nb\nc\nd\ne').error, 'too_many_lines');
  assert.equal(validateText('a\nb\nc\nd').ok, true);
});

test('validateText:21 文字は too_many_chars、20 文字・4 行は ok', () => {
  assert.equal(validateText('あ'.repeat(21)).error, 'too_many_chars');
  const r = validateText('あいうえお\nかきくけこ\nさしすせそ\nたちつてと');
  assert.equal(r.ok, true);
  assert.equal(r.count, 20);
});

test('validateText:末尾に続く空行は取り除き、先頭・途中の空行は残す', () => {
  assert.deepEqual(validateText('草\n').lines, ['草']);
  const r = validateText('a\nb\nc\nd\n\n');
  assert.equal(r.ok, true);
  assert.equal(r.lines.length, 4);
  assert.deepEqual(validateText('\na\n\nb').lines, ['', 'a', '', 'b']);
});

test('validateText:\\r\\n と \\r を \\n にそろえる', () => {
  assert.deepEqual(validateText('a\r\nb\rc').lines, ['a', 'b', 'c']);
});

test('validateText:結合文字列の絵文字を 1 文字と数え、空白も数える', () => {
  assert.equal(validateText('👨‍👩‍👧‍👦').count, 1);
  assert.equal(validateText('🇯🇵 a').count, 3);
});

test('validateText:エラーでも lines と count を返す', () => {
  const r = validateText('あ'.repeat(25));
  assert.equal(r.ok, false);
  assert.equal(r.count, 25);
  assert.deepEqual(r.lines, ['あ'.repeat(25)]);
});

test('validateFileName:空は emoji', () => {
  assert.deepEqual(validateFileName(''), { ok: true, fileName: 'emoji' });
});

test('validateFileName:64 文字は ok、65 文字は too_long', () => {
  assert.equal(validateFileName('a'.repeat(64)).ok, true);
  assert.equal(validateFileName('a'.repeat(65)).error, 'too_long');
  assert.equal(validateFileName('あ'.repeat(65)).error, 'too_long');
});

test('validateFileName:記号・全角・空白は invalid_chars', () => {
  for (const name of ['a-b', 'えもじ', ' ok', 'ok ', 'a.b']) {
    assert.equal(validateFileName(name).error, 'invalid_chars', name);
  }
  assert.deepEqual(validateFileName('Ok_123'), { ok: true, fileName: 'Ok_123' });
});

test('validateHexColor', () => {
  assert.deepEqual(validateHexColor('#AbCdEf'), { ok: true, value: '#abcdef' });
  for (const bad of ['abcdef', '#abc', '#abcdeg', '#abcdef0', '']) {
    assert.equal(validateHexColor(bad).ok, false, bad);
  }
});

test('parseIntInput:空・数でない値は fallback', () => {
  assert.equal(parseIntInput('', -10, 10, 3), 3);
  assert.equal(parseIntInput('  ', -10, 10, 3), 3);
  assert.equal(parseIntInput('-', -10, 10, 3), 3);
  assert.equal(parseIntInput('abc', -10, 10, 3), 3);
});

test('parseIntInput:範囲に収め、Math.round で丸める', () => {
  assert.equal(parseIntInput('20', -10, 10, 3), 10);
  assert.equal(parseIntInput('-20', -10, 10, 3), -10);
  assert.equal(parseIntInput('2.5', -10, 10, 0), 3);
  assert.equal(parseIntInput('-2.5', -10, 10, 0), -2);
  assert.equal(parseIntInput('0', -10, 10, 3), 0);
});

const settings = { ...DEFAULT_SETTINGS };

test('renderKey:縁取りの色・影の色・フォント・読み込み状態の変更で変わる', () => {
  const base = renderKey(settings, 'meg-a', 'ready');
  assert.notEqual(renderKey({ ...settings, outline: { ...settings.outline, color: '#000000' } }, 'meg-a', 'ready'), base);
  assert.notEqual(renderKey({ ...settings, shadow: { ...settings.shadow, color: '#ff0000' } }, 'meg-a', 'ready'), base);
  assert.notEqual(renderKey(settings, 'meg-b', 'ready'), base);
  assert.notEqual(renderKey(settings, 'meg-a', 'loading'), base);
});

test('renderKey:ファイル名は含まない', () => {
  const base = renderKey(settings, 'meg-a', 'ready');
  assert.equal(renderKey({ ...settings, fileName: 'other' }, 'meg-a', 'ready'), base);
});

test('layoutKey:色の変更では変わらず、文字・縁取りの太さ・動きで変わる', () => {
  const base = layoutKey(settings, 'meg-a', 'ready');
  assert.equal(layoutKey({ ...settings, fill: { ...settings.fill, color1: '#000000' } }, 'meg-a', 'ready'), base);
  assert.notEqual(layoutKey({ ...settings, text: '草' }, 'meg-a', 'ready'), base);
  assert.notEqual(layoutKey({ ...settings, outline: { ...settings.outline, width: 2 } }, 'meg-a', 'ready'), base);
  assert.notEqual(layoutKey({ ...settings, motion: 'rotate' }, 'meg-a', 'ready'), base);
});
