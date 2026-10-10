export const WORKER_READY_TIMEOUT_MS = 10000;

/**
 * 必要なブラウザ機能を調べ、不足している項目名の配列を返す(詳細設計 2.13)。
 * @returns {string[]}
 */
export function checkSupport() {
  const missing = [];
  const canvas = document.createElement('canvas');
  if (!canvas.getContext('2d') || typeof HTMLCanvasElement.prototype.toBlob !== 'function') missing.push('Canvas');
  if (typeof TextMetrics === 'undefined' || !('actualBoundingBoxAscent' in TextMetrics.prototype)) missing.push('文字の大きさの測定');
  if (typeof FontFace !== 'function' || !document.fonts) missing.push('フォントの登録');
  if (typeof Worker !== 'function') missing.push('Web Worker');
  try {
    new CompressionStream('deflate');
  } catch {
    missing.push('圧縮');
  }
  if (typeof Intl.Segmenter !== 'function') missing.push('文字の分割');
  if (typeof URL.createObjectURL !== 'function' || !('download' in HTMLAnchorElement.prototype)) missing.push('ダウンロード');
  return missing;
}

/**
 * module 形式の Worker を起動し、ready を受け取れたらその Worker を返す。
 * @param {URL|string} url
 * @returns {Promise<Worker>}
 */
export function checkModuleWorker(url) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(url, { type: 'module' });
    } catch (e) {
      reject(e);
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('worker ready timeout'));
    }, WORKER_READY_TIMEOUT_MS);
    worker.addEventListener('message', function onReady(event) {
      if (event.data?.type !== 'ready') return;
      clearTimeout(timer);
      worker.removeEventListener('message', onReady);
      resolve(worker);
    });
    worker.addEventListener('error', () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('worker failed to load'));
    }, { once: true });
  });
}
