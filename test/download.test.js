import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionFor, formatBytes } from '../js/ui/download.js';

test('formatBytes の境界値', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1048575), '1024.0 KB');
  assert.equal(formatBytes(1048576), '1.00 MB');
});

test('extensionFor', () => {
  assert.equal(extensionFor('png'), '.png');
  assert.equal(extensionFor('apng'), '.png');
  assert.equal(extensionFor('gif'), '.gif');
});
