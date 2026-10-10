/**
 * メッセージのコードと文言(詳細設計 6.1)。`<名前>` のような部分は formatMessage の引数で埋める。
 * kind はメッセージ欄での扱い(error は role="alert" で出す)。
 */
export const MESSAGES = Object.freeze({
  'I-001': { kind: 'info', text: '設定を読み込んでいます…' },
  'E-001': { kind: 'error', text: '設定ファイルを読み込めませんでした({cause})。通信状況を確認して「再試行」を押してください。' },
  'E-101': { kind: 'error', text: 'フォント「{name}」を読み込めませんでした({cause})。「再試行」を押すか、別のフォントを選んでください。' },
  'E-201': { kind: 'error', text: 'フォントファイルが大きすぎます(20MB まで)。' },
  'E-202': { kind: 'error', text: '対応していない形式のファイルです(TTF・OTF・WOFF・WOFF2 に対応)。' },
  'E-203': { kind: 'error', text: 'フォントファイルを読み込めませんでした。ファイルが壊れている可能性があります。' },
  'E-301': { kind: 'error', text: '画像を生成できませんでした。「もう一度生成」を押してください。' },
  'E-401': { kind: 'input', text: '文字を入力してください。' },
  'E-402': { kind: 'input', text: '4 行以内にしてください。' },
  'E-403': { kind: 'input', text: '20 文字以内にしてください。' },
  'E-404': { kind: 'input', text: '#RRGGBB の形式で入力してください。' },
  'E-405': { kind: 'input', text: 'ファイル名は 64 文字以内にしてください。' },
  'E-406': { kind: 'input', text: 'ファイル名には半角英数字と _ だけが使えます(Misskey の絵文字名の規則)。' },
  'E-999': { kind: 'error', text: '予期しないエラーが発生しました。ページを再読み込みしてください。' },
  'W-001': { kind: 'warning', text: '選んだフォントにない文字があります:{chars}。この文字はほかのフォントで表示される場合があり、プレビューのとおりに保存されます。' },
  'W-002': { kind: 'warning', text: '字形の有無を確認できません(確認用フォントの読み込みに失敗しました)。' },
  'W-003': { kind: 'warning', text: 'ファイルサイズが {limit} を超えています。サーバーによっては登録できない、または表示が重くなる場合があります。' },
  'W-004': { kind: 'warning', text: 'GIF は半透明を表現できないため、背景が透明だと縁がギザギザになります。' },
  'W-005': { kind: 'warning', text: '白・黒・灰色の文字色では、虹色にしても色が変わりません。色の付いた文字色を選んでください。' },
});

/** 設定ファイル・フォントの読み込み失敗の原因の文言(詳細設計 6.1 E-001・E-101) */
export const CAUSES = Object.freeze({
  network: '通信エラー',
  timeout: '時間切れ',
  http: 'サーバーの応答エラー',
  parse: '設定ファイルの形式の誤り',
  invalid: '設定ファイルの形式の誤り',
  decode: 'フォントファイルの形式の誤り',
});

/**
 * @param {string} code
 * @param {Record<string, string>} [params]
 * @returns {string}
 */
export function formatMessage(code, params = {}) {
  const message = MESSAGES[code];
  if (!message) throw new Error(`unknown message code: ${code}`);
  return message.text.replace(/\{(\w+)\}/g, (_, key) => (key in params ? String(params[key]) : `{${key}}`));
}
