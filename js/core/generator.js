import { IMAGE_SIZE } from './layout.js';
import { FRAME_DELAY_MS, frameCount } from './motions.js';
import { createRenderer } from './renderer.js';

export const ENCODE_DEBOUNCE_MS = 500;
export const ENCODE_TIMEOUT_MS = 60000;
export const WORKER_URL = new URL('../worker/encode-worker.js', import.meta.url);

// setTimeout(0) より待ちが短く、描画の合間に画面の処理を挟めるマクロタスク
function yieldToEventLoop() {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}

/**
 * 保存用ファイルの生成とプレビュー用フレームの作成を管理する(詳細設計 2.10)。
 * @param {{
 *   initialWorker: Worker,
 *   onFrames: (frames: { canvas?: HTMLCanvasElement, images?: ImageData[] } | null) => void,
 *   onOutput: (output: object) => void,
 *   onFailure: () => void,
 * }} options
 */
export function createGenerator({ initialWorker, onFrames, onOutput, onFailure }) {
  const renderer = createRenderer();
  const outCanvas = document.createElement('canvas');
  outCanvas.width = IMAGE_SIZE;
  outCanvas.height = IMAGE_SIZE;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

  let worker;
  let workerBusy = false;
  let workerBroken = false;
  let jobId = 0;
  let key = null;
  let input = null;
  let frames = null;
  let framesReady = false;
  let debounceElapsed = false;
  let debounceTimer = null;
  let timeoutTimer = null;
  let output = { state: 'none' };

  function setOutput(next) {
    output = next;
    onOutput(output);
  }

  function attachWorker(w) {
    worker = w;
    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', handleWorkerError);
  }

  function replaceWorker() {
    worker.removeEventListener('message', handleWorkerMessage);
    worker.removeEventListener('error', handleWorkerError);
    worker.terminate();
    attachWorker(new Worker(WORKER_URL, { type: 'module' }));
    workerBusy = false;
    workerBroken = false;
  }

  function fail() {
    setOutput({ state: 'failed', key });
    onFailure();
  }

  function handleWorkerMessage(event) {
    const msg = event.data ?? {};
    if (msg.type !== 'done' && msg.type !== 'error') return;
    // 古いジョブの応答や、時間切れで失敗にした後の応答は捨てる
    if (msg.jobId !== jobId || output.state !== 'generating') return;
    workerBusy = false;
    clearTimeout(timeoutTimer);
    if (msg.type === 'done') {
      setOutput({
        state: 'ready',
        blob: new Blob([msg.data], { type: msg.mime }),
        bytes: msg.data.byteLength,
        format: input.settings.format,
        key,
      });
    } else {
      console.error(msg.message);
      fail();
    }
  }

  function handleWorkerError(event) {
    workerBroken = true;
    if (!workerBusy) return;
    console.error(event.message ?? 'worker error');
    clearTimeout(timeoutTimer);
    workerBusy = false;
    fail();
  }

  function renderFrame(t) {
    renderer.render(outCtx, {
      settings: input.settings,
      family: input.family,
      layout: input.layout,
      motion: input.settings.motion,
      t,
    });
  }

  function encodePng(myJob) {
    setOutput({ state: 'generating', key });
    outCanvas.toBlob((blob) => {
      if (myJob !== jobId) return;
      if (!blob) {
        fail();
        return;
      }
      setOutput({ state: 'ready', blob, bytes: blob.size, format: 'png', key });
    }, 'image/png');
  }

  function encodeAnimation(myJob) {
    if (myJob !== jobId) return;
    setOutput({ state: 'generating', key });
    if (workerBroken) {
      fail();
      return;
    }
    const buffers = frames.map((f) => f.data.buffer.slice(0));
    worker.postMessage({
      type: 'encode',
      jobId,
      format: input.settings.format,
      width: IMAGE_SIZE,
      height: IMAGE_SIZE,
      delayMs: FRAME_DELAY_MS,
      frames: buffers,
    }, buffers);
    workerBusy = true;
    timeoutTimer = setTimeout(() => {
      if (myJob !== jobId) return;
      workerBusy = false;
      workerBroken = true;
      fail();
    }, ENCODE_TIMEOUT_MS);
  }

  async function startJob() {
    jobId += 1;
    const myJob = jobId;
    key = input.key;
    frames = null;
    framesReady = false;
    debounceElapsed = false;
    clearTimeout(debounceTimer);
    clearTimeout(timeoutTimer);
    setOutput({ state: 'none', key });
    if (workerBusy || workerBroken) replaceWorker();

    if (!input.canRender) {
      onFrames(null);
      return;
    }

    const { motion, speed } = input.settings;
    if (motion === 'none') {
      renderFrame(0);
      onFrames({ canvas: outCanvas });
      setOutput({ state: 'generating', key });
      debounceTimer = setTimeout(() => encodePng(myJob), ENCODE_DEBOUNCE_MS);
      return;
    }

    setOutput({ state: 'generating', key });
    onFrames({ images: null });
    debounceTimer = setTimeout(() => {
      debounceElapsed = true;
      if (framesReady) encodeAnimation(myJob);
    }, ENCODE_DEBOUNCE_MS);
    const count = frameCount(motion, speed);
    const images = [];
    for (let i = 0; i < count; i++) {
      if (myJob !== jobId) return;
      renderFrame(i / count);
      images.push(outCtx.getImageData(0, 0, IMAGE_SIZE, IMAGE_SIZE));
      await yieldToEventLoop();
    }
    if (myJob !== jobId) return;
    frames = images;
    framesReady = true;
    onFrames({ images });
    if (debounceElapsed) encodeAnimation(myJob);
  }

  attachWorker(initialWorker);

  return {
    /**
     * @param {{ key: string, canRender: boolean, settings: object, family: string, layout: object }} next
     */
    update(next) {
      input = next;
      if (next.key === key) return;
      startJob().catch((e) => {
        console.error(e);
        fail();
      });
    },
    regenerate() {
      if (!input) return;
      startJob().catch((e) => {
        console.error(e);
        fail();
      });
    },
    get output() {
      return output;
    },
  };
}
