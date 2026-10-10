const REVOKE_DELAY_MS = 60000;

/**
 * @param {Blob} blob
 * @param {string} fileName 拡張子を含む
 */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * @param {number} n バイト数
 * @returns {string}
 */
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {'png'|'apng'|'gif'} format
 * @returns {string}
 */
export function extensionFor(format) {
  return format === 'gif' ? '.gif' : '.png';
}
