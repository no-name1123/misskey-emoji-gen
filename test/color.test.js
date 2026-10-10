import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToHsl, hexToRgb, hslToHex } from '../js/core/color.js';

test('hexToRgb', () => {
  assert.deepEqual(hexToRgb('#ff8000'), { r: 255, g: 128, b: 0 });
  assert.throws(() => hexToRgb('#fff'));
});

test('hexToHsl の代表値', () => {
  assert.deepEqual(hexToHsl('#ff0000'), { h: 0, s: 100, l: 50 });
  assert.deepEqual(hexToHsl('#00ff00'), { h: 120, s: 100, l: 50 });
  assert.deepEqual(hexToHsl('#0000ff'), { h: 240, s: 100, l: 50 });
  assert.equal(hexToHsl('#808080').s, 0);
  assert.equal(hexToHsl('#808080').h, 0);
});

test('hslToHex の代表値と色相の折り返し', () => {
  assert.equal(hslToHex(0, 100, 50), '#ff0000');
  assert.equal(hslToHex(120, 100, 50), '#00ff00');
  assert.equal(hslToHex(360, 100, 50), '#ff0000');
  assert.equal(hslToHex(-240, 100, 50), '#00ff00');
  assert.equal(hslToHex(0, 0, 50), '#808080');
});

test('往復で元の色に戻る', () => {
  for (const hex of ['#e53935', '#fb8c00', '#123456', '#000000', '#ffffff']) {
    const { h, s, l } = hexToHsl(hex);
    assert.equal(hslToHex(h, s, l), hex);
  }
});
