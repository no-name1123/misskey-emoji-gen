import { MESSAGES, formatMessage } from './errors.js';

let container = null;

/** @param {HTMLElement} element メッセージ欄(MS-01) */
export function initMessages(element) {
  container = element;
}

/**
 * メッセージ欄にコードのメッセージを表示する。同じコードは置き換える。
 * @param {string} code
 * @param {Record<string, string>} [params]
 * @param {{ label: string, onClick: () => void }[]} [actions]
 */
export function showMessage(code, params = {}, actions = []) {
  clearMessage(code);
  const { kind } = MESSAGES[code];
  const p = document.createElement('p');
  p.className = `message ${kind}`;
  p.dataset.code = code;
  if (kind === 'error') p.setAttribute('role', 'alert');
  p.textContent = formatMessage(code, params);
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary';
    button.textContent = action.label;
    button.addEventListener('click', action.onClick);
    p.append(button);
  }
  container.append(p);
}

/** @param {string} code */
export function clearMessage(code) {
  container?.querySelector(`[data-code="${code}"]`)?.remove();
}
