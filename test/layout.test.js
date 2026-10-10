import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, decorationRect } from '../js/core/layout.js';
import { sweptRect } from '../js/core/motions.js';

// 幅 = 大きさ × 文字数、上端 = 0.8 × 大きさ、下端 = 0.2 × 大きさ の固定幅フォント
const measure = (s, text) => ({ left: 0, right: s * [...text].length, ascent: 0.8 * s, descent: 0.2 * s });
const noDeco = { outline: 0, shadow: null };
const sweepFor = (motion) => (rect) => sweptRect(motion, rect);
// 枠の判定は各辺 ±0.001 の誤差を許す(詳細設計 2.7)ため、大きさの比較も 0.01 の誤差を許す
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

function layout(lines, opts = {}) {
  return computeLayout({ lines, align: 'center', measure, deco: noDeco, sweep: sweepFor('none'), ...opts });
}

test('1 行 1 文字は枠(120)いっぱいの大きさになる', () => {
  const l = layout(['草']);
  near(l.fontSize, 120, 1e-2);
  near(l.drawRect.left, 4, 1e-2);
  near(l.drawRect.right, 124, 1e-2);
});

test('1 行 2 文字は幅で決まる', () => {
  near(layout(['了解']).fontSize, 60, 1e-2);
});

test('複数行は高さで決まり、行間を含む', () => {
  near(layout(['あ', 'い']).fontSize, 120 / 2.08, 1e-2);
});

test('drawRect の中心が画像の中心 (64, 64) に来る', () => {
  const l = layout(['あいう', 'え'], { deco: { outline: 5, shadow: { dx: 4, dy: 2, blur: 3 } } });
  near((l.drawRect.left + l.drawRect.right) / 2, 64);
  near((l.drawRect.top + l.drawRect.bottom) / 2, 64);
  near(l.drawRectCentered.left, l.drawRect.left - 64);
  near(l.drawRectCentered.top, l.drawRect.top - 64);
});

test('行揃え:左・中央・右の x', () => {
  const lines = ['あいう', 'え'];
  const left = layout(lines, { align: 'left' });
  const center = layout(lines, { align: 'center' });
  const right = layout(lines, { align: 'right' });
  const s = left.fontSize;
  near(left.lines[1].x, left.lines[0].x);
  near(center.lines[1].x, center.lines[0].x + s);
  near(right.lines[1].x, right.lines[0].x + 2 * s);
});

test('各行の y は ascent と行間で並ぶ', () => {
  const l = layout(['あ', 'い', 'う']);
  const s = l.fontSize;
  near(l.lines[1].y - l.lines[0].y, s + 0.08 * s);
  near(l.lines[0].y - l.textRect.top, 0.8 * s);
});

test('縁取り・影を加えた範囲が枠に収まる', () => {
  const deco = { outline: 12, shadow: { dx: 10, dy: -10, blur: 10 } };
  const l = layout(['あいうえ'], { deco });
  assert.ok(l.drawRect.left >= 4 - 1e-3 && l.drawRect.right <= 124 + 1e-3);
  assert.ok(l.drawRect.top >= 4 - 1e-3 && l.drawRect.bottom <= 124 + 1e-3);
  near(decorationRect(l.textRect, deco).width, l.drawRect.width);
});

test('回転では回転しても枠に収まるよう小さくなる', () => {
  const still = layout(['了解']);
  const rot = layout(['了解'], { sweep: sweepFor('rotate') });
  assert.ok(rot.fontSize < still.fontSize);
  assert.ok(sweptRect('rotate', rot.drawRectCentered).right <= 60 + 1e-3);
});

test('収まる最大の大きさである(大きさを 1% 増やすと収まらない)', () => {
  for (const motion of ['none', 'rotate', 'shake']) {
    const params = { lines: ['了解', 'です'], align: 'center', measure, deco: { outline: 6, shadow: { dx: 3, dy: 3, blur: 2 } }, sweep: sweepFor(motion) };
    const l = computeLayout(params);
    const enlarged = computeLayout({ ...params, measure: (s, t) => measure(s * 1.01, t) });
    assert.ok(enlarged.fontSize < l.fontSize, motion);
    const swept = sweptRect(motion, l.drawRectCentered);
    assert.ok(swept.right <= 60 + 1e-3 && swept.bottom <= 60 + 1e-3, motion);
  }
});

test('空行は高さ 0 の行として扱う', () => {
  const l = layout(['あ', '', 'い']);
  assert.equal(l.lines.length, 3);
  assert.equal(l.lines[1].text, '');
});
