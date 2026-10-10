import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSave } from '../js/ui/app.js';

const base = () => ({
  textResult: { ok: true },
  fontState: 'ready',
  fileNameResult: { ok: true },
  output: { state: 'ready', key: 'k1' },
  currentKey: 'k1',
});

test('canSave:すべて満たすと保存できる', () => {
  assert.deepEqual(canSave(base()), { ok: true });
});

test('canSave:最初に満たさない条件の理由を返す', () => {
  assert.deepEqual(canSave({ ...base(), textResult: { ok: false }, fontState: 'loading' }), { ok: false, reason: 'text' });
  assert.deepEqual(canSave({ ...base(), fontState: 'loading' }), { ok: false, reason: 'font' });
  assert.deepEqual(canSave({ ...base(), fontState: 'failed' }), { ok: false, reason: 'font' });
  assert.deepEqual(canSave({ ...base(), fileNameResult: { ok: false } }), { ok: false, reason: 'fileName' });
  for (const state of ['none', 'generating', 'failed']) {
    assert.deepEqual(canSave({ ...base(), output: { state, key: 'k1' } }), { ok: false, reason: 'output' });
  }
});

test('canSave:出力が古い設定のものなら保存できない', () => {
  assert.deepEqual(canSave({ ...base(), currentKey: 'k2' }), { ok: false, reason: 'output' });
});
