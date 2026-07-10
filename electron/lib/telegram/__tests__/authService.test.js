const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createInteractiveAuth } = require('../authService');

function createMockClient() {
  const client = new EventEmitter();
  client.login = (handlers) => {
    client._handlers = handlers;
    return new Promise(() => {});
  };
  client.invoke = async () => {};
  return client;
}

test('submitPhone queues value before getPhoneNumber waits', async () => {
  const client = createMockClient();
  const states = [];
  const auth = createInteractiveAuth(client, (state) => states.push(state));
  auth.runLogin();

  auth.submitPhone('+84901234567');
  const phonePromise = client._handlers.getPhoneNumber(false);
  assert.equal(await phonePromise, '+84901234567');
});

test('submitPhone resolves active waiter', async () => {
  const client = createMockClient();
  const auth = createInteractiveAuth(client, () => {});
  auth.runLogin();

  const phonePromise = client._handlers.getPhoneNumber(false);
  auth.submitPhone('+84901234567');
  assert.equal(await phonePromise, '+84901234567');
});

test('authorizationStateWaitEmailAddress maps to waitEmail', () => {
  const client = createMockClient();
  const states = [];
  createInteractiveAuth(client, (state) => states.push(state));

  client.emit('update', {
    _: 'updateAuthorizationState',
    authorization_state: { _: 'authorizationStateWaitEmailAddress' },
  });

  assert.deepEqual(states, ['waitEmail']);
});

test('submitEmail resolves getEmailAddress waiter', async () => {
  const client = createMockClient();
  const auth = createInteractiveAuth(client, () => {});
  auth.runLogin();

  const emailPromise = client._handlers.getEmailAddress();
  auth.submitEmail('user@example.com');
  assert.equal(await emailPromise, 'user@example.com');
});

test('empty submitCode does not reject getAuthCode waiter', async () => {
  const client = createMockClient();
  const auth = createInteractiveAuth(client, () => {});
  auth.runLogin();

  const codePromise = client._handlers.getAuthCode(false);
  assert.throws(() => auth.submitCode('   '), /Invalid auth code/);
  auth.submitCode('12345');
  assert.equal(await codePromise, '12345');
});

test('restartLogin starts a fresh client.login()', () => {
  const client = createMockClient();
  let loginCount = 0;
  client.login = () => {
    loginCount += 1;
    return new Promise(() => {});
  };
  const auth = createInteractiveAuth(client, () => {});
  auth.runLogin();
  assert.equal(loginCount, 1);
  auth.restartLogin();
  assert.equal(loginCount, 2);
});

test('restartLogin clears queued phone so getPhoneNumber waits again', async () => {
  const client = createMockClient();
  const auth = createInteractiveAuth(client, () => {});
  auth.runLogin();
  auth.submitPhone('+84901111111');
  auth.restartLogin();
  const phonePromise = client._handlers.getPhoneNumber(false);
  auth.submitPhone('+84902222222');
  assert.equal(await phonePromise, '+84902222222');
});
