import { computeLayout } from '../core/layout.js';
import { isRainbowIneffective, sweptRect } from '../core/motions.js';
import { DEFAULT_SETTINGS, layoutKey, renderKey, validateFileName, validateText } from '../core/settings.js';
import {
  findMissingGlyphs,
  loadBlankFont,
  loadLocalFont,
  loadWebFont,
  FONT_FAMILY_PREFIX,
} from '../core/fonts.js';
import { createGenerator } from '../core/generator.js';
import { CAUSES, formatMessage } from './errors.js';
import { bindForm, setAllDisabled } from './form.js';
import { createPreview } from './preview.js';
import { clearMessage, showMessage } from './messages.js';
import { downloadBlob, extensionFor, formatBytes } from './download.js';

const $ = (id) => document.getElementById(id);

const TEXT_ERRORS = { empty: 'E-401', too_many_lines: 'E-402', too_many_chars: 'E-403' };
const FILE_NAME_ERRORS = { too_long: 'E-405', invalid_chars: 'E-406' };
const LOCAL_FONT_ERRORS = { too_large: 'E-201', unsupported: 'E-202', broken: 'E-203' };
const LOCAL_OPTION_VALUE = '__local__';

const SAVE_REASONS = {
  text: '文字の入力を確認してください',
  font: 'フォントの読み込みが終わるまでお待ちください',
  fileName: 'ファイル名を確認してください',
  output: '画像を生成しています',
  outputFailed: '画像を生成できませんでした',
};

/**
 * 保存できるかを判定する。
 * @param {{ textResult: { ok: boolean }, fontState: string, fileNameResult: { ok: boolean },
 *   output: { state: string, key?: string }, currentKey: string }} state
 * @returns {{ ok: true } | { ok: false, reason: 'text'|'font'|'fileName'|'output' }}
 */
export function canSave({ textResult, fontState, fileNameResult, output, currentKey }) {
  if (!textResult.ok) return { ok: false, reason: 'text' };
  if (fontState !== 'ready') return { ok: false, reason: 'font' };
  if (!fileNameResult.ok) return { ok: false, reason: 'fileName' };
  if (output.state !== 'ready' || output.key !== currentKey) return { ok: false, reason: 'output' };
  return { ok: true };
}

/**
 * 画面を起動する。
 * @param {object} config config.json の内容
 * @param {Worker} worker 起動を確認した Worker
 */
export function startApp(config, worker) {
  const measureCanvas = document.createElement('canvas').getContext('2d');
  const measureCache = new Map();
  const fontsById = new Map(config.fonts.map((f) => [f.id, f]));

  const state = {
    fontRef: { type: 'web', id: config.defaultFontId, state: 'loading' },
    localFont: null,
    blankState: 'loading',
    settings: null,
    textResult: { ok: false },
    fileNameResult: { ok: true, fileName: 'emoji' },
    missingGlyphs: [],
    layout: null,
    layoutKey: null,
    glyphKey: null,
  };

  const preview = createPreview({ large: $('pv-large'), light: $('pv-light'), dark: $('pv-dark'), overlay: $('pv-overlay') });
  const generator = createGenerator({
    initialWorker: worker,
    onFrames: (frames) => {
      if (!frames) return;
      if (frames.canvas) {
        preview.setOverlay(null);
        preview.showImage(frames.canvas);
      } else if (frames.images) {
        preview.setOverlay(null);
        preview.play(frames.images);
      } else {
        preview.clear();
        preview.setOverlay('準備中…');
      }
    },
    onOutput: () => updateSaveArea(),
    onFailure: () => {
      showMessage('E-301', {}, [{ label: 'もう一度生成', onClick: () => generator.regenerate() }]);
      updateSaveArea();
    },
  });

  const form = bindForm(() => refresh());

  function family() {
    return state.fontRef.type === 'local' ? state.localFont.family : FONT_FAMILY_PREFIX + state.fontRef.id;
  }

  function measure(fontSize, text) {
    const key = `${family()}\u0000${fontSize}\u0000${text}`;
    let m = measureCache.get(key);
    if (!m) {
      measureCanvas.font = `${fontSize}px "${family()}"`;
      const x = measureCanvas.measureText(text);
      m = { left: x.actualBoundingBoxLeft, right: x.actualBoundingBoxRight, ascent: x.actualBoundingBoxAscent, descent: x.actualBoundingBoxDescent };
      measureCache.set(key, m);
    }
    return m;
  }

  function measureWidth(font, text) {
    measureCanvas.font = font;
    return measureCanvas.measureText(text).width;
  }

  function currentRenderKey() {
    return renderKey(state.settings, family(), state.fontRef.state);
  }

  // ---- フォント ----

  function fillFontOptions() {
    const select = $('fm-font');
    select.textContent = '';
    if (state.localFont) {
      const opt = document.createElement('option');
      opt.value = LOCAL_OPTION_VALUE;
      opt.textContent = `手持ちフォント:${state.localFont.fileName}`;
      select.append(opt);
    }
    for (const f of config.fonts) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.name}(${f.category})`;
      select.append(opt);
    }
    select.value = state.fontRef.type === 'local' ? LOCAL_OPTION_VALUE : state.fontRef.id;
  }

  function showFontStatus() {
    const status = $('fm-status');
    const retry = $('fm-retry');
    const s = state.fontRef.state;
    status.hidden = s === 'ready';
    status.textContent = s === 'loading' ? 'フォントを読み込み中…' : s === 'failed' ? 'フォントを読み込めませんでした' : '';
    retry.hidden = s !== 'failed';
  }

  function selectWebFont(id) {
    clearMessage('E-101');
    clearMessage('E-201');
    clearMessage('E-202');
    clearMessage('E-203');
    const font = fontsById.get(id);
    state.fontRef = { type: 'web', id, state: 'loading' };
    showFontStatus();
    refresh();
    loadWebFont(font).then(
      () => {
        if (state.fontRef.type !== 'web' || state.fontRef.id !== id) return;
        state.fontRef = { type: 'web', id, state: 'ready' };
        showFontStatus();
        refresh();
      },
      (e) => {
        if (state.fontRef.type !== 'web' || state.fontRef.id !== id) return;
        state.fontRef = { type: 'web', id, state: 'failed' };
        showFontStatus();
        showMessage('E-101', { name: font.name, cause: CAUSES[e.kind] ?? CAUSES.network }, [
          { label: '再試行', onClick: () => selectWebFont(id) },
        ]);
        refresh();
      },
    );
  }

  async function onLocalFontFile() {
    const input = $('fm-file');
    const file = input.files?.[0];
    if (!file) return;
    for (const code of ['E-201', 'E-202', 'E-203']) clearMessage(code);
    const status = $('fm-status');
    status.hidden = false;
    status.textContent = '読み込み中…';
    try {
      state.localFont = await loadLocalFont(file);
      state.fontRef = { type: 'local', state: 'ready' };
      clearMessage('E-101');
      fillFontOptions();
    } catch (e) {
      // 失敗時は直前のフォントのままにする
      showMessage(LOCAL_FONT_ERRORS[e.kind] ?? 'E-203');
      input.value = '';
    }
    showFontStatus();
    refresh();
  }

  $('fm-font').addEventListener('change', () => {
    const value = $('fm-font').value;
    if (value === LOCAL_OPTION_VALUE) {
      clearMessage('E-101');
      state.fontRef = { type: 'local', state: 'ready' };
      showFontStatus();
      refresh();
    } else {
      selectWebFont(value);
    }
  });
  $('fm-retry').addEventListener('click', () => {
    if (state.fontRef.type === 'web') selectWebFont(state.fontRef.id);
  });
  $('fm-file').addEventListener('change', onLocalFontFile);

  // ---- 字形の判定 ----

  function updateGlyphs() {
    const key = JSON.stringify([state.textResult.lines, family(), state.fontRef.state, state.blankState]);
    if (key === state.glyphKey) return;
    state.glyphKey = key;
    const canCheck = state.fontRef.state === 'ready' && state.blankState === 'ready';
    state.missingGlyphs = canCheck ? findMissingGlyphs(state.textResult.lines ?? [], family(), measureWidth) : [];
    const warning = $('pv-glyph-warning');
    warning.hidden = state.missingGlyphs.length === 0;
    warning.textContent = state.missingGlyphs.length ? formatMessage('W-001', { chars: state.missingGlyphs.join(' ') }) : '';
  }

  // ---- 入力の反映 ----

  function showTextResult() {
    const r = state.textResult;
    const count = $('tx-count');
    count.textContent = `${r.count} / 20 文字`;
    count.classList.toggle('field-error', r.error === 'too_many_chars');
    const error = $('tx-error');
    error.hidden = r.ok;
    error.textContent = r.ok ? '' : formatMessage(TEXT_ERRORS[r.error]);
  }

  function showWarnings() {
    const s = state.settings;
    const rainbowWarning = $('mv-warning');
    rainbowWarning.hidden = !(s.motion === 'rainbow' && isRainbowIneffective(s.fill));
    rainbowWarning.textContent = formatMessage('W-005');
    const gifWarning = $('mv-format-warning');
    gifWarning.hidden = !(s.motion !== 'none' && s.format === 'gif' && s.background.type === 'transparent');
    gifWarning.textContent = formatMessage('W-004');
  }

  function overlayText() {
    const r = state.textResult;
    if (r.error === 'empty') return '文字を入力してください';
    if (!r.ok) return '4 行・20 文字以内にしてください';
    if (state.fontRef.state === 'loading') return 'フォントを読み込み中…';
    if (state.fontRef.state === 'failed') return 'フォントを読み込めませんでした';
    return null;
  }

  function updateLayout() {
    const s = state.settings;
    const key = layoutKey(s, family(), state.fontRef.state);
    if (key === state.layoutKey) return;
    state.layoutKey = key;
    state.layout = computeLayout({
      lines: state.textResult.lines,
      align: s.align,
      measure,
      deco: {
        outline: s.outline.enabled ? s.outline.width : 0,
        shadow: s.shadow.enabled ? { dx: s.shadow.dx, dy: s.shadow.dy, blur: s.shadow.blur } : null,
      },
      sweep: (rect) => sweptRect(s.motion, rect),
    });
  }

  function refresh() {
    const s = form.readForm();
    state.settings = s;
    form.updateEnabled(s);
    state.textResult = validateText(s.text);
    showTextResult();
    showWarnings();
    updateGlyphs();

    const canRender = state.textResult.ok && state.fontRef.state === 'ready';
    if (canRender) updateLayout();
    const overlay = overlayText();
    if (overlay) {
      preview.clear();
      preview.setOverlay(overlay);
    }
    const key = currentRenderKey();
    if (key !== generator.output.key) clearMessage('E-301');
    generator.update({ key, canRender, settings: s, family: family(), layout: state.layout });
    updateSaveArea();
  }

  // ---- 保存 ----

  function updateFileName() {
    const raw = $('sv-name').value;
    state.fileNameResult = validateFileName(raw);
    const error = $('sv-name-error');
    error.hidden = state.fileNameResult.ok;
    error.textContent = state.fileNameResult.ok ? '' : formatMessage(FILE_NAME_ERRORS[state.fileNameResult.error]);
    updateSaveArea();
  }

  function saveState() {
    return {
      textResult: state.textResult,
      fontState: state.fontRef.state,
      fileNameResult: state.fileNameResult,
      output: generator.output,
      currentKey: state.settings ? currentRenderKey() : null,
    };
  }

  function updateSaveArea() {
    if (!state.settings) return;
    const output = generator.output;
    const format = state.settings.motion === 'none' ? 'png' : state.settings.format;
    $('sv-ext').textContent = extensionFor(format);

    const ready = output.state === 'ready' && output.key === currentRenderKey();
    $('sv-size').textContent = ready ? `ファイルサイズ:${formatBytes(output.bytes)}` : output.state === 'generating' ? '生成中…' : '';
    const sizeWarning = $('sv-size-warning');
    sizeWarning.hidden = !(ready && output.bytes > config.sizeWarningBytes);
    sizeWarning.textContent = formatMessage('W-003', { limit: formatBytes(config.sizeWarningBytes) });

    const result = canSave(saveState());
    $('sv-save').disabled = !result.ok;
    const reason = $('sv-reason');
    reason.hidden = result.ok;
    if (!result.ok) {
      reason.textContent = result.reason === 'output' && output.state === 'failed' ? SAVE_REASONS.outputFailed : SAVE_REASONS[result.reason];
    }
    $('sv-retry').hidden = output.state !== 'failed';
  }

  $('sv-name').addEventListener('input', updateFileName);
  $('sv-retry').addEventListener('click', () => {
    clearMessage('E-301');
    generator.regenerate();
  });
  $('sv-save').addEventListener('click', () => {
    if (!canSave(saveState()).ok) return;
    const output = generator.output;
    downloadBlob(output.blob, state.fileNameResult.fileName + extensionFor(output.format));
  });

  // ---- 使い方・ライセンス ----

  function fillLicenses() {
    const list = $('ft-licenses');
    const items = [
      ...config.fonts.map((f) => ({ name: f.name, license: f.license, file: f.licenseFile })),
      { name: 'Adobe Blank 2(字形の確認に使用)', license: 'OFL-1.1', file: config.blankFont.licenseFile },
    ];
    for (const item of items) {
      const li = document.createElement('li');
      li.append(`${item.name} — `);
      const a = document.createElement('a');
      a.href = item.file;
      a.textContent = item.license === 'OFL-1.1' ? 'SIL Open Font License 1.1' : 'Apache License 2.0';
      li.append(a);
      list.append(li);
    }
  }

  // ---- 起動 ----

  setAllDisabled($('app'), false);
  form.setForm(DEFAULT_SETTINGS);
  fillFontOptions();
  fillLicenses();
  updateFileName();
  selectWebFont(config.defaultFontId);
  loadBlankFont(config.blankFont).then(
    () => {
      state.blankState = 'ready';
      refresh();
    },
    () => {
      state.blankState = 'failed';
      showMessage('W-002');
      refresh();
    },
  );
}
