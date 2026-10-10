import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, formatMessage } from '../js/ui/errors.js';

const EXPECTED_CODES = [
  'I-001', 'E-001', 'E-101', 'E-201', 'E-202', 'E-203', 'E-301',
  'E-401', 'E-402', 'E-403', 'E-404', 'E-405', 'E-406', 'E-999',
  'W-001', 'W-002', 'W-003', 'W-004', 'W-005',
];

test('すべてのメッセージコードがあり、余分なコードがない', () => {
  assert.deepEqual(Object.keys(MESSAGES).sort(), [...EXPECTED_CODES].sort());
  assert.equal(new Set(EXPECTED_CODES).size, EXPECTED_CODES.length);
});

test('formatMessage は引数を埋める', () => {
  assert.equal(
    formatMessage('E-101', { name: 'Yomogi', cause: '時間切れ' }),
    'フォント「Yomogi」を読み込めませんでした(時間切れ)。「再試行」を押すか、別のフォントを選んでください。',
  );
  assert.equal(formatMessage('E-201'), 'フォントファイルが大きすぎます(20MB まで)。');
  assert.throws(() => formatMessage('E-000'));
});
