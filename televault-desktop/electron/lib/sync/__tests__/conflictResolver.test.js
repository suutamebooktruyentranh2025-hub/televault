const test = require('node:test');
const assert = require('node:assert/strict');
const { conflictName } = require('../conflictResolver');

test('generates conflict name with date suffix', () => {
  const result = conflictName('photo.jpg', new Date('2026-07-06'));
  assert.equal(result, 'photo (conflict 2026-07-06).jpg');
});

test('handles files without extension', () => {
  const result = conflictName('Makefile', new Date('2026-07-06'));
  assert.equal(result, 'Makefile (conflict 2026-07-06)');
});

test('handles nested paths', () => {
  const result = conflictName('docs/readme.md', new Date('2026-07-06'));
  assert.equal(result, 'docs/readme (conflict 2026-07-06).md');
});

test('increments suffix when conflict name already exists', () => {
  const existing = ['photo (conflict 2026-07-06).jpg'];
  const result = conflictName('photo.jpg', new Date('2026-07-06'), existing);
  assert.equal(result, 'photo (conflict 2026-07-06 2).jpg');
});
