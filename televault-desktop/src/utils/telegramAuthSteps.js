/** True when the UI should collect a phone number (country + national). */
export function isPhoneAuthStep(authState) {
  return authState === 'waitPhone' || authState === 'starting' || authState === 'loggedOut';
}

/** Reset phone fields only when entering a phone step from a non-phone step. */
export function shouldResetPhoneFields(prevState, nextState) {
  return isPhoneAuthStep(nextState) && !isPhoneAuthStep(prevState);
}

const TEXT_INPUT_STATES = new Set([
  'waitCode',
  'waitEmail',
  'waitEmailCode',
  'waitPassword',
  'waitRegistration',
]);

/** Reset single-line auth input when entering a new non-phone step. */
export function shouldResetTextInput(prevState, nextState) {
  return TEXT_INPUT_STATES.has(nextState) && nextState !== prevState;
}
