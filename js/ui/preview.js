import { FRAME_DELAY_MS } from '../core/motions.js';
import { IMAGE_SIZE } from '../core/layout.js';

/**
 * プレビューの表示と再生(詳細設計 2.10.3)。
 * @param {{ large: HTMLCanvasElement, light: HTMLCanvasElement, dark: HTMLCanvasElement, overlay: HTMLElement }} elements
 */
export function createPreview({ large, light, dark, overlay }) {
  const targets = [large, light, dark].map((c) => c.getContext('2d'));
  const work = document.createElement('canvas');
  work.width = IMAGE_SIZE;
  work.height = IMAGE_SIZE;
  const workCtx = work.getContext('2d');
  let frames = null;
  let startTime = 0;
  let shownIndex = -1;
  let rafId = 0;

  function drawAll(source) {
    for (const ctx of targets) {
      ctx.clearRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
      ctx.drawImage(source, 0, 0);
    }
  }

  function clearAll() {
    for (const ctx of targets) ctx.clearRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
  }

  function tick(now) {
    if (!frames) return;
    const index = Math.floor((now - startTime) / FRAME_DELAY_MS) % frames.length;
    // 表示中のフレームが変わったときだけ描き直す
    if (index !== shownIndex) {
      shownIndex = index;
      workCtx.putImageData(frames[index], 0, 0);
      drawAll(work);
    }
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    frames = null;
    shownIndex = -1;
  }

  return {
    /** 静止画を表示する */
    showImage(canvas) {
      stop();
      drawAll(canvas);
    },
    /** アニメーションのフレーム列を再生する */
    play(images) {
      stop();
      frames = images;
      startTime = performance.now();
      rafId = requestAnimationFrame(tick);
    },
    /** 画像を消す */
    clear() {
      stop();
      clearAll();
    },
    /** @param {string|null} text 重ねる文言(null で消す) */
    setOverlay(text) {
      overlay.hidden = text === null;
      overlay.textContent = text ?? '';
    },
  };
}
