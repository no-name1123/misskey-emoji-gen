const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });

/**
 * 文字列を見た目の 1 文字(書記素)ごとに分ける。
 * @param {string} text
 * @returns {string[]}
 */
export function splitGraphemes(text) {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}
