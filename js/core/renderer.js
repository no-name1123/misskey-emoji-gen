import { IMAGE_SIZE } from './layout.js';
import { textFillAt, transformAt } from './motions.js';

const HALF = IMAGE_SIZE / 2;

function createCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;
  return canvas;
}

function fillStyleFor(ctx, fill, textRect) {
  if (fill.type !== 'gradient') return fill.color1;
  const { left, top, right, bottom } = textRect;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  let gradient;
  if (fill.direction === 'horizontal') gradient = ctx.createLinearGradient(left, cy, right, cy);
  else if (fill.direction === 'diagonal') gradient = ctx.createLinearGradient(left, top, right, bottom);
  else gradient = ctx.createLinearGradient(cx, top, cx, bottom);
  gradient.addColorStop(0, fill.color1);
  gradient.addColorStop(1, fill.color2);
  return gradient;
}

/**
 * 1 枚の画像を描く描画処理を作る(詳細設計 2.9)。
 * 文字・縁取り・影を変形なしで作業用 Canvas に描いてから、画像の中心を基準に変形して重ねる。
 * Canvas の影は描画時の変形の影響を受けないため、影も文字と一緒に変形されるようにこの順にしている。
 */
export function createRenderer() {
  const textCanvas = createCanvas();
  const textCtx = textCanvas.getContext('2d');
  const workCanvas = createCanvas();
  const workCtx = workCanvas.getContext('2d');

  /**
   * @param {CanvasRenderingContext2D} outCtx 128×128 の出力先
   * @param {{ settings: object, family: string, layout: object, motion: string, t: number }} params
   */
  function render(outCtx, { settings, family, layout, motion, t }) {
    textCtx.clearRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
    textCtx.font = `${layout.fontSize}px "${family}"`;
    textCtx.textBaseline = 'alphabetic';
    textCtx.textAlign = 'left';
    if (settings.outline.enabled) {
      textCtx.lineWidth = settings.outline.width * 2;
      textCtx.lineJoin = 'round';
      textCtx.strokeStyle = settings.outline.color;
      for (const line of layout.lines) textCtx.strokeText(line.text, line.x, line.y);
    }
    textCtx.fillStyle = fillStyleFor(textCtx, textFillAt(motion, t, settings.fill), layout.textRect);
    for (const line of layout.lines) textCtx.fillText(line.text, line.x, line.y);

    workCtx.clearRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
    workCtx.save();
    if (settings.shadow.enabled) {
      // 縁取りと文字をまとめた画像に影を付け、文字の影が縁取りの上に重ならないようにする
      workCtx.shadowColor = settings.shadow.color;
      workCtx.shadowOffsetX = settings.shadow.dx;
      workCtx.shadowOffsetY = settings.shadow.dy;
      workCtx.shadowBlur = settings.shadow.blur;
    }
    workCtx.drawImage(textCanvas, 0, 0);
    workCtx.restore();

    outCtx.clearRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
    if (settings.background.type === 'solid') {
      outCtx.fillStyle = settings.background.color;
      outCtx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
    }
    const tf = transformAt(motion, t, { rect: layout.drawRectCentered });
    outCtx.save();
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.globalAlpha = tf.alpha;
    outCtx.translate(HALF + tf.dx, HALF + tf.dy);
    outCtx.rotate(tf.angle);
    outCtx.scale(tf.scale, tf.scale);
    outCtx.drawImage(workCanvas, -HALF, -HALF);
    outCtx.restore();
  }

  return { render };
}
