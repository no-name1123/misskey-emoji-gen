import { hexToHsl, hslToHex } from './color.js';

export const FPS = 20;
export const FRAME_DELAY_MS = 50;

export const MOTIONS = Object.freeze(['none', 'blink', 'rotate', 'scroll', 'shake', 'pulse', 'rainbow']);

/** 速さごとの 1 周期の長さ(秒) */
export const SPEEDS = Object.freeze({ slow: 2, normal: 1, fast: 0.5 });

const SHAKE_X = 3;
const SHAKE_Y = 2;
const IMAGE_HALF = 64;

/**
 * @param {string} motion
 * @param {string} speed
 * @returns {number} 1 周期のフレーム数(動きなしは 1)
 */
export function frameCount(motion, speed) {
  if (!MOTIONS.includes(motion)) throw new Error(`unknown motion: ${motion}`);
  if (!(speed in SPEEDS)) throw new Error(`unknown speed: ${speed}`);
  if (motion === 'none') return 1;
  return Math.round(SPEEDS[speed] * FPS);
}

/**
 * 時刻 t(0 以上 1 未満)の変形を返す(詳細設計 2.8)。
 * @param {string} motion
 * @param {number} t
 * @param {{ rect: { left: number, right: number, width: number } }} ctx rect は画像中心を原点とする静止時の描画範囲
 * @returns {{ dx: number, dy: number, angle: number, scale: number, alpha: number }}
 */
export function transformAt(motion, t, ctx) {
  const tf = { dx: 0, dy: 0, angle: 0, scale: 1, alpha: 1 };
  switch (motion) {
    case 'blink':
      tf.alpha = t < 0.5 ? 1 : 0;
      break;
    case 'rotate':
      tf.angle = 2 * Math.PI * t;
      break;
    case 'scroll':
      // 右の画像外から入り、左の画像外へ出る
      tf.dx = IMAGE_HALF + ctx.rect.right - t * (2 * IMAGE_HALF + ctx.rect.width);
      break;
    case 'shake':
      tf.dx = SHAKE_X * Math.sin(2 * Math.PI * 4 * t);
      tf.dy = SHAKE_Y * Math.sin(2 * Math.PI * 6 * t);
      break;
    case 'pulse':
      // 拡大率を 1 以下にして、作業用 Canvas の画像を引き伸ばさない(基本設計 UB-3)
      tf.scale = 0.9 - 0.1 * Math.cos(2 * Math.PI * t);
      break;
    default:
      break;
  }
  return tf;
}

function makeRect(left, top, right, bottom) {
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/**
 * 1 周期の間に rect が通る範囲を返す(画像中心を原点とする座標)。
 * @param {string} motion
 * @param {{ left: number, top: number, right: number, bottom: number }} rect
 */
export function sweptRect(motion, rect) {
  switch (motion) {
    case 'rotate': {
      const r = Math.max(
        Math.hypot(rect.left, rect.top),
        Math.hypot(rect.right, rect.top),
        Math.hypot(rect.left, rect.bottom),
        Math.hypot(rect.right, rect.bottom),
      );
      return makeRect(-r, -r, r, r);
    }
    case 'shake':
      return makeRect(rect.left - SHAKE_X, rect.top - SHAKE_Y, rect.right + SHAKE_X, rect.bottom + SHAKE_Y);
    default:
      return makeRect(rect.left, rect.top, rect.right, rect.bottom);
  }
}

const rotateHue = (hex, degrees) => {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h + degrees, s, l);
};

/**
 * 時刻 t の文字色。虹色なら選んだ色の色相を 360 × t ずらす(詳細設計 2.8)。
 * @param {string} motion
 * @param {number} t
 * @param {{ type: string, color1: string, color2: string, direction: string }} fill
 */
export function textFillAt(motion, t, fill) {
  if (motion !== 'rainbow') return fill;
  return { ...fill, color1: rotateHue(fill.color1, 360 * t), color2: rotateHue(fill.color2, 360 * t) };
}

/**
 * 虹色で色が変わらない(使用中の文字色がすべて彩度 0)かを返す。W-005 の表示に使う。
 * @param {{ type: string, color1: string, color2: string }} fill
 */
export function isRainbowIneffective(fill) {
  const colors = fill.type === 'gradient' ? [fill.color1, fill.color2] : [fill.color1];
  return colors.every((c) => hexToHsl(c).s === 0);
}
