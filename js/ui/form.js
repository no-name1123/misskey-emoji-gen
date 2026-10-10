import { parseIntInput, validateHexColor } from '../core/settings.js';
import { formatMessage } from './errors.js';

const $ = (id) => document.getElementById(id);

const radioValue = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
const setRadio = (name, value) => {
  for (const input of document.querySelectorAll(`input[name="${name}"]`)) input.checked = input.value === value;
};

const COLOR_FIELDS = [
  { path: 'fill.color1', picker: 'cl-color1-picker', text: 'cl-color1-text' },
  { path: 'fill.color2', picker: 'cl-color2-picker', text: 'cl-color2-text' },
  { path: 'background.color', picker: 'bg-color-picker', text: 'bg-color-text' },
  { path: 'outline.color', picker: 'ol-color-picker', text: 'ol-color-text' },
  { path: 'shadow.color', picker: 'sh-color-picker', text: 'sh-color-text' },
];

const NUMBER_FIELDS = [
  { path: 'outline.width', id: 'ol-width', min: 1, max: 12, output: 'ol-width-value' },
  { path: 'shadow.dx', id: 'sh-dx', min: -10, max: 10 },
  { path: 'shadow.dy', id: 'sh-dy', min: -10, max: 10 },
  { path: 'shadow.blur', id: 'sh-blur', min: 0, max: 10, output: 'sh-blur-value' },
];

const getPath = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);

/**
 * 入力欄の読み取りと表示の切り替え(詳細設計 5.3)。
 * 色と数値は、項目ごとに直前の正しい値を持ち、正しくない入力のときはそれを使う。
 * @param {() => void} onChange 入力が変わったときに呼ぶ
 */
export function bindForm(onChange) {
  const lastValid = {};

  for (const field of COLOR_FIELDS) {
    const picker = $(field.picker);
    const text = $(field.text);
    const error = text.parentElement.querySelector('.field-error');
    picker.addEventListener('input', () => {
      text.value = picker.value;
      lastValid[field.path] = picker.value;
      error.hidden = true;
      onChange();
    });
    text.addEventListener('input', () => {
      const result = validateHexColor(text.value.trim());
      if (result.ok) {
        lastValid[field.path] = result.value;
        picker.value = result.value;
        error.hidden = true;
      } else {
        error.textContent = formatMessage('E-404');
        error.hidden = false;
      }
      onChange();
    });
  }

  for (const field of NUMBER_FIELDS) {
    const input = $(field.id);
    const read = () => parseIntInput(input.value, field.min, field.max, lastValid[field.path]);
    input.addEventListener('input', () => {
      lastValid[field.path] = read();
      if (field.output) $(field.output).textContent = String(lastValid[field.path]);
      onChange();
    });
    // 確定時だけ入力欄に書き戻す(入力途中の「-」などを消さないため)
    input.addEventListener('change', () => {
      lastValid[field.path] = read();
      input.value = String(lastValid[field.path]);
    });
  }

  $('tx-text').addEventListener('input', onChange);
  for (const id of ['cl-direction', 'mv-motion', 'ol-enabled', 'sh-enabled']) $(id).addEventListener('change', onChange);
  for (const name of ['align', 'fill-type', 'bg-type', 'speed', 'format']) {
    for (const input of document.querySelectorAll(`input[name="${name}"]`)) input.addEventListener('change', onChange);
  }

  return {
    /** 入力欄を設定値で埋める */
    setForm(settings) {
      $('tx-text').value = settings.text;
      setRadio('align', settings.align);
      setRadio('fill-type', settings.fill.type);
      $('cl-direction').value = settings.fill.direction;
      setRadio('bg-type', settings.background.type);
      $('ol-enabled').checked = settings.outline.enabled;
      $('sh-enabled').checked = settings.shadow.enabled;
      $('mv-motion').value = settings.motion;
      setRadio('speed', settings.speed);
      setRadio('format', settings.format);
      for (const field of COLOR_FIELDS) {
        const value = getPath(settings, field.path);
        lastValid[field.path] = value;
        $(field.picker).value = value;
        $(field.text).value = value;
      }
      for (const field of NUMBER_FIELDS) {
        const value = getPath(settings, field.path);
        lastValid[field.path] = value;
        $(field.id).value = String(value);
        if (field.output) $(field.output).textContent = String(value);
      }
    },

    /** 入力欄から絵文字設定(フォントを除く)を読み取る */
    readForm() {
      return {
        text: $('tx-text').value,
        align: radioValue('align'),
        fill: {
          type: radioValue('fill-type'),
          color1: lastValid['fill.color1'],
          color2: lastValid['fill.color2'],
          direction: $('cl-direction').value,
        },
        background: { type: radioValue('bg-type'), color: lastValid['background.color'] },
        outline: { enabled: $('ol-enabled').checked, color: lastValid['outline.color'], width: lastValid['outline.width'] },
        shadow: {
          enabled: $('sh-enabled').checked,
          color: lastValid['shadow.color'],
          dx: lastValid['shadow.dx'],
          dy: lastValid['shadow.dy'],
          blur: lastValid['shadow.blur'],
        },
        motion: $('mv-motion').value,
        speed: radioValue('speed'),
        format: radioValue('format'),
      };
    },

    /** 設定に応じて項目の有効・無効を切り替える(詳細設計 5.3) */
    updateEnabled(settings) {
      const gradient = settings.fill.type === 'gradient';
      setDisabled(['cl-color2-picker', 'cl-color2-text', 'cl-direction'], !gradient);
      setDisabled(['bg-color-picker', 'bg-color-text'], settings.background.type !== 'solid');
      setDisabled(['ol-color-picker', 'ol-color-text', 'ol-width'], !settings.outline.enabled);
      setDisabled(['sh-color-picker', 'sh-color-text', 'sh-dx', 'sh-dy', 'sh-blur'], !settings.shadow.enabled);
      const still = settings.motion === 'none';
      for (const input of document.querySelectorAll('#mv-speed-group input, #mv-format-group input')) input.disabled = still;
    },
  };
}

function setDisabled(ids, disabled) {
  for (const id of ids) $(id).disabled = disabled;
}

/**
 * 操作部の入力欄・ボタンをまとめて有効・無効にする(設定ファイル取得中など。詳細設計 5.1)。
 * @param {HTMLElement} root
 * @param {boolean} disabled
 */
export function setAllDisabled(root, disabled) {
  for (const el of root.querySelectorAll('input, select, textarea, button')) {
    if (el.closest('#messages')) continue;
    el.disabled = disabled;
  }
}
