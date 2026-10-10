export const IMAGE_SIZE = 128;
export const PADDING = 4;
export const LINE_GAP_RATIO = 0.08;

const HALF = IMAGE_SIZE / 2;
const FRAME_HALF = HALF - PADDING;
const EPSILON = 0.001;
const MIN_FONT_SIZE = 1;
const MAX_FONT_SIZE = 512;
const SEARCH_STEPS = 40;

function makeRect(left, top, right, bottom) {
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function translateRect(r, dx, dy) {
  return makeRect(r.left + dx, r.top + dy, r.right + dx, r.bottom + dy);
}

/**
 * 文字の塊の矩形に縁取りと影の広がりを加えた、静止時の描画範囲を返す(詳細設計 2.7 手順 2)。
 * @param {{ left: number, top: number, right: number, bottom: number }} textRect
 * @param {{ outline: number, shadow: { dx: number, dy: number, blur: number } | null }} deco
 */
export function decorationRect(textRect, deco) {
  const o = deco.outline;
  const r1 = makeRect(textRect.left - o, textRect.top - o, textRect.right + o, textRect.bottom + o);
  if (!deco.shadow) return r1;
  const { dx, dy, blur } = deco.shadow;
  const r2 = makeRect(r1.left + dx - blur, r1.top + dy - blur, r1.right + dx + blur, r1.bottom + dy + blur);
  return makeRect(
    Math.min(r1.left, r2.left),
    Math.min(r1.top, r2.top),
    Math.max(r1.right, r2.right),
    Math.max(r1.bottom, r2.bottom),
  );
}

function place(s, { lines, align, measure, deco }) {
  const metrics = lines.map((text) => (text === '' ? { left: 0, right: 0, ascent: 0, descent: 0 } : measure(s, text)));
  const widths = metrics.map((m) => m.left + m.right);
  const ascent = Math.max(...metrics.map((m) => m.ascent));
  const descent = Math.max(...metrics.map((m) => m.descent));
  const lineHeight = ascent + descent;
  const gap = s * LINE_GAP_RATIO;
  const n = lines.length;
  const blockWidth = Math.max(...widths);
  const blockHeight = n * lineHeight + (n - 1) * gap;

  const placed = lines.map((text, i) => {
    let lx = 0;
    if (align === 'center') lx = (blockWidth - widths[i]) / 2;
    else if (align === 'right') lx = blockWidth - widths[i];
    return { text, x: lx + metrics[i].left, y: i * (lineHeight + gap) + ascent };
  });

  const textRect = makeRect(0, 0, blockWidth, blockHeight);
  const drawRect = decorationRect(textRect, deco);
  // 静止時の描画範囲の中心を画像の中心に合わせる(基本設計 FN-02 ②)
  const dx = HALF - (drawRect.left + drawRect.right) / 2;
  const dy = HALF - (drawRect.top + drawRect.bottom) / 2;
  const movedDraw = translateRect(drawRect, dx, dy);
  return {
    fontSize: s,
    lines: placed.map((l) => ({ text: l.text, x: l.x + dx, y: l.y + dy })),
    textRect: translateRect(textRect, dx, dy),
    drawRect: movedDraw,
    drawRectCentered: translateRect(movedDraw, -HALF, -HALF),
  };
}

function fits(layout, sweep) {
  const s = sweep(layout.drawRectCentered);
  return (
    s.left >= -FRAME_HALF - EPSILON &&
    s.top >= -FRAME_HALF - EPSILON &&
    s.right <= FRAME_HALF + EPSILON &&
    s.bottom <= FRAME_HALF + EPSILON
  );
}

/**
 * 文字が枠に収まる最大の大きさと各行の位置を求める(詳細設計 2.7)。
 * @param {{
 *   lines: string[],
 *   align: 'left'|'center'|'right',
 *   measure: (fontSize: number, text: string) => { left: number, right: number, ascent: number, descent: number },
 *   deco: { outline: number, shadow: { dx: number, dy: number, blur: number } | null },
 *   sweep: (rect: object) => object,
 * }} params
 */
export function computeLayout(params) {
  let lo = MIN_FONT_SIZE;
  let hi = MAX_FONT_SIZE;
  if (!fits(place(lo, params), params.sweep)) return place(lo, params);
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (fits(place(mid, params), params.sweep)) lo = mid;
    else hi = mid;
  }
  return place(lo, params);
}
