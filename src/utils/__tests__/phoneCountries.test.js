import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PHONE_COUNTRY_ISO,
  formatInternationalPhone,
  getPhoneCountry,
} from '../phoneCountries.js';

test('default country is Vietnam +84', () => {
  assert.equal(DEFAULT_PHONE_COUNTRY_ISO, 'VN');
  assert.equal(getPhoneCountry('VN').dial, '+84');
});

test('formatInternationalPhone strips leading zero for Vietnam', () => {
  assert.equal(formatInternationalPhone('+84', '0901234567'), '+84901234567');
  assert.equal(formatInternationalPhone('+84', '901234567'), '+84901234567');
});

test('formatInternationalPhone keeps other countries', () => {
  assert.equal(formatInternationalPhone('+1', '5551234567'), '+15551234567');
});
