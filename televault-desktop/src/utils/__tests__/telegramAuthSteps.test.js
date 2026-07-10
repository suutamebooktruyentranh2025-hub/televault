import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPhoneAuthStep,
  shouldResetPhoneFields,
  shouldResetTextInput,
} from '../telegramAuthSteps.js';

test('phone step includes waitPhone and post-logout states', () => {
  assert.equal(isPhoneAuthStep('waitPhone'), true);
  assert.equal(isPhoneAuthStep('starting'), true);
  assert.equal(isPhoneAuthStep('loggedOut'), true);
  assert.equal(isPhoneAuthStep('waitCode'), false);
});

test('starting to waitPhone does not reset phone fields', () => {
  assert.equal(shouldResetPhoneFields('starting', 'waitPhone'), false);
  assert.equal(shouldResetPhoneFields('loggedOut', 'waitPhone'), false);
});

test('waitCode to waitPhone resets phone fields', () => {
  assert.equal(shouldResetPhoneFields('waitCode', 'waitPhone'), true);
});

test('waitPhone to waitCode resets text input once', () => {
  assert.equal(shouldResetTextInput('waitPhone', 'waitCode'), true);
  assert.equal(shouldResetTextInput('waitCode', 'waitCode'), false);
});
