import { encodeApng } from '../codec/apng.js';
import { encodeGif } from '../codec/gif.js';

async function deflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

self.addEventListener('message', async (event) => {
  const { type, jobId, format, width, height, delayMs, frames } = event.data ?? {};
  if (type !== 'encode') return;
  try {
    const pixels = frames.map((buffer) => new Uint8ClampedArray(buffer));
    const bytes = format === 'gif'
      ? encodeGif(pixels, width, height, delayMs)
      : await encodeApng(pixels, width, height, delayMs, deflate);
    // ビューが大きなバッファーの一部を指していても余分なバイトを含めない(詳細設計 2.11)
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    self.postMessage({ type: 'done', jobId, data, mime: format === 'gif' ? 'image/gif' : 'image/png' }, [data]);
  } catch (e) {
    self.postMessage({ type: 'error', jobId, message: String(e?.stack ?? e) });
  }
});

self.postMessage({ type: 'ready' });
