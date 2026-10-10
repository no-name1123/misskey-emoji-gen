import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from '../js/codec/crc32.js';

const ascii = (s) => new TextEncoder().encode(s);

test('IEND の CRC が既知の値になる', () => {
  assert.equal(crc32(ascii('IEND')), 0xae426082);
});

test('123456789 の CRC が既知の値になる', () => {
  assert.equal(crc32(ascii('123456789')), 0xcbf43926);
});

test('空のバイト列は 0', () => {
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('initial を渡すと連結したバイト列と同じ結果になる', () => {
  const first = crc32(ascii('1234'));
  assert.equal(crc32(ascii('56789'), first), 0xcbf43926);
});
