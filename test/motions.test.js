import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameCount, isRainbowIneffective, sweptRect, textFillAt, transformAt } from '../js/core/motions.js';
import { hexToHsl } from '../js/core/color.js';

const rect = { left: -30, top: -20, right: 30, bottom: 20, width: 60, height: 40 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('frameCount', () => {
  assert.equal(frameCount('none', 'normal'), 1);
  assert.equal(frameCount('rotate', 'slow'), 40);
  assert.equal(frameCount('rotate', 'normal'), 20);
  assert.equal(frameCount('rotate', 'fast'), 10);
  assert.throws(() => frameCount('jump', 'normal'));
  assert.throws(() => frameCount('rotate', 'turbo'));
});

test('none・rainbow は既定値', () => {
  for (const m of ['none', 'rainbow']) {
    assert.deepEqual(transformAt(m, 0.3, { rect }), { dx: 0, dy: 0, angle: 0, scale: 1, alpha: 1 });
  }
});

test('blink:前半は表示、後半は非表示', () => {
  assert.equal(transformAt('blink', 0, { rect }).alpha, 1);
  assert.equal(transformAt('blink', 0.49, { rect }).alpha, 1);
  assert.equal(transformAt('blink', 0.5, { rect }).alpha, 0);
});

test('rotate:t = 0.5 で半回転', () => {
  near(transformAt('rotate', 0.5, { rect }).angle, Math.PI);
});

test('scroll:t = 0 で文字の左端が画像の右端、t = 1 で右端が画像の左端', () => {
  near(rect.left + transformAt('scroll', 0, { rect }).dx, 64);
  near(rect.right + transformAt('scroll', 1, { rect }).dx, -64);
});

test('shake と pulse の値', () => {
  near(transformAt('shake', 1 / 16, { rect }).dx, 3);
  near(transformAt('pulse', 0, { rect }).scale, 0.8);
  near(transformAt('pulse', 0.5, { rect }).scale, 1);
  for (let i = 0; i < 20; i++) {
    const sc = transformAt('pulse', i / 20, { rect }).scale;
    assert.ok(sc >= 0.8 - 1e-9 && sc <= 1 + 1e-9);
  }
});

test('sweptRect:回転は最も遠い隅までの半径の正方形、振動は左右 3・上下 2 広がる', () => {
  const r = Math.hypot(30, 20);
  const rot = sweptRect('rotate', rect);
  near(rot.left, -r);
  near(rot.bottom, r);
  near(sweptRect('rotate', { left: 0, top: 0, right: 10, bottom: 10 }).right, Math.hypot(10, 10));
  const sh = sweptRect('shake', rect);
  assert.deepEqual([sh.left, sh.top, sh.right, sh.bottom], [-33, -22, 33, 22]);
  for (const m of ['none', 'blink', 'scroll', 'pulse', 'rainbow']) {
    const x = sweptRect(m, rect);
    assert.deepEqual([x.left, x.top, x.right, x.bottom, x.width, x.height], [-30, -20, 30, 20, 60, 40]);
  }
});

test('textFillAt:虹色は色相だけ 360 × t ずれる', () => {
  const fill = { type: 'gradient', color1: '#ff0000', color2: '#0000ff', direction: 'diagonal' };
  const out = textFillAt('rainbow', 1 / 3, fill);
  assert.equal(out.type, 'gradient');
  assert.equal(out.direction, 'diagonal');
  assert.equal(out.color1, '#00ff00');
  assert.equal(out.color2, '#ff0000');
  const before = hexToHsl('#e53935');
  const after = hexToHsl(textFillAt('rainbow', 0.25, { ...fill, color1: '#e53935' }).color1);
  assert.ok(Math.abs(after.l - before.l) < 1);
  assert.equal(textFillAt('rainbow', 0.4, { ...fill, color1: '#808080' }).color1, '#808080');
  assert.equal(textFillAt('rotate', 0.4, fill), fill);
});

test('isRainbowIneffective', () => {
  assert.equal(isRainbowIneffective({ type: 'solid', color1: '#ffffff', color2: '#ff0000' }), true);
  assert.equal(isRainbowIneffective({ type: 'gradient', color1: '#ffffff', color2: '#ff0000' }), false);
  assert.equal(isRainbowIneffective({ type: 'gradient', color1: '#000000', color2: '#808080' }), true);
});
