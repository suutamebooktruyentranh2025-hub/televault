/**
 * Interactive Telegram login via tdl client.login() + UI-driven resolvers.
 * @param {import('tdl').Client} client
 * @param {(state: string, detail?: Record<string, unknown>) => void} onStateChange
 */
function createInteractiveAuth(client, onStateChange) {
  /** @type {Record<string, unknown>} */
  const authDetail = {};

  /**
   * @param {{
   *   validate?: (value: string) => string | null,
   *   invalidMessage?: string,
   * }} [opts]
   */
  function createInputQueue(opts = {}) {
    /** @type {string | null} */
    let pending = null;
    /** @type {Array<{ resolve: (v: string) => void, reject: (e: Error) => void }>} */
    const waiters = [];

    return {
      wait() {
        if (pending != null) {
          const value = pending;
          pending = null;
          return Promise.resolve(value);
        }
        return new Promise((resolve, reject) => {
          waiters.push({ resolve, reject });
        });
      },
      submit(rawValue) {
        const value = String(rawValue ?? '').trim();
        const invalid = opts.validate?.(value) ?? (value ? null : opts.invalidMessage || 'Invalid value');
        if (invalid) {
          // Never reject the TDLib waiter on client-side validation — that kills client.login().
          return { ok: false, error: invalid };
        }
        const waiter = waiters.shift();
        if (waiter) {
          waiter.resolve(value);
          return { ok: true };
        }
        pending = value;
        return { ok: true, queued: true };
      },
      rejectAll(message) {
        pending = null;
        while (waiters.length) waiters.shift()?.reject(new Error(message));
      },
      clearPending() {
        pending = null;
      },
    };
  }

  const phoneQueue = createInputQueue({ invalidMessage: 'Invalid phone number' });
  const emailQueue = createInputQueue({ invalidMessage: 'Invalid email address' });
  const emailCodeQueue = createInputQueue({ invalidMessage: 'Invalid email code' });
  const codeQueue = createInputQueue({ invalidMessage: 'Invalid auth code' });
  const passwordQueue = createInputQueue({ invalidMessage: 'Invalid password' });

  function clearAllPending() {
    phoneQueue.clearPending();
    emailQueue.clearPending();
    emailCodeQueue.clearPending();
    codeQueue.clearPending();
    passwordQueue.clearPending();
    pendingName = null;
  }
  /** @type {{ resolve: (v: { firstName: string, lastName: string }) => void, reject: (e: Error) => void } | null} */
  let nameWaiter = null;
  /** @type {{ firstName: string, lastName: string } | null} */
  let pendingName = null;

  let loginPromise = null;
  let closed = false;

  function rejectAllQueues(message) {
    phoneQueue.rejectAll(message);
    emailQueue.rejectAll(message);
    emailCodeQueue.rejectAll(message);
    codeQueue.rejectAll(message);
    passwordQueue.rejectAll(message);
    if (nameWaiter) {
      nameWaiter.reject(new Error(message));
      nameWaiter = null;
    }
    pendingName = null;
  }

  client.on('update', (update) => {
    if (update._ !== 'updateAuthorizationState') return;
    const st = update.authorization_state;
    console.log('[TeleVault] updateAuthorizationState:', st._);
    switch (st._) {
      case 'authorizationStateWaitPhoneNumber':
        onStateChange('waitPhone');
        break;
      case 'authorizationStateWaitEmailAddress':
        onStateChange('waitEmail');
        break;
      case 'authorizationStateWaitEmailCode':
        onStateChange('waitEmailCode');
        break;
      case 'authorizationStateWaitOtherDeviceConfirmation':
        authDetail.otherDeviceLink = st.link || '';
        onStateChange('waitOtherDevice', { otherDeviceLink: authDetail.otherDeviceLink });
        break;
      case 'authorizationStateWaitCode':
        onStateChange('waitCode');
        break;
      case 'authorizationStateWaitRegistration':
        onStateChange('waitRegistration');
        break;
      case 'authorizationStateWaitPassword':
        authDetail.passwordHint = st.password_hint || '';
        onStateChange('waitPassword', { passwordHint: authDetail.passwordHint });
        break;
      case 'authorizationStateReady':
        authDetail.otherDeviceLink = '';
        authDetail.passwordHint = '';
        onStateChange('ready');
        break;
      case 'authorizationStateClosed':
      case 'authorizationStateLoggingOut':
        onStateChange('loggedOut');
        break;
      default:
        break;
    }
  });

  function beginLogin() {
    if (loginPromise) return loginPromise;
    loginPromise = client.login({
      type: 'user',
      getPhoneNumber: () => {
        onStateChange('waitPhone');
        return phoneQueue.wait();
      },
      getEmailAddress: () => {
        onStateChange('waitEmail');
        return emailQueue.wait();
      },
      getEmailCode: () => {
        onStateChange('waitEmailCode');
        return emailCodeQueue.wait();
      },
      confirmOnAnotherDevice: (link) => {
        authDetail.otherDeviceLink = link;
        onStateChange('waitOtherDevice', { otherDeviceLink: link });
      },
      getAuthCode: () => {
        onStateChange('waitCode');
        return codeQueue.wait();
      },
      getPassword: (passwordHint) => {
        authDetail.passwordHint = passwordHint || '';
        onStateChange('waitPassword', { passwordHint: authDetail.passwordHint });
        return passwordQueue.wait();
      },
      getName: () => {
        onStateChange('waitRegistration');
        if (pendingName) {
          const value = pendingName;
          pendingName = null;
          return Promise.resolve(value);
        }
        return new Promise((resolve, reject) => {
          nameWaiter = { resolve, reject };
        });
      },
    });
    return loginPromise;
  }

  return {
    get authDetail() {
      return authDetail;
    },

    get current() {
      return 'starting';
    },

    runLogin() {
      return beginLogin();
    },

    /** After TDLib logOut, the prior client.login() promise is dead — start a fresh one. */
    restartLogin() {
      if (closed) throw new Error('Auth closed');
      loginPromise = null;
      clearAllPending();
      return beginLogin();
    },

    submitPhone(phone) {
      const result = phoneQueue.submit(phone);
      if (!result.ok) throw new Error(result.error || 'Invalid phone number');
    },

    submitEmail(email) {
      const result = emailQueue.submit(email);
      if (!result.ok) throw new Error(result.error || 'Invalid email address');
    },

    submitEmailCode(code) {
      const result = emailCodeQueue.submit(code);
      if (!result.ok) throw new Error(result.error || 'Invalid email code');
    },

    submitCode(code) {
      const result = codeQueue.submit(code);
      if (!result.ok) throw new Error(result.error || 'Invalid auth code');
    },

    submitPassword(password) {
      const result = passwordQueue.submit(password);
      if (!result.ok) throw new Error(result.error || 'Invalid password');
    },

    submitRegistration(firstName, lastName = '') {
      const first = String(firstName || '').trim();
      const last = String(lastName || '').trim();
      if (!first) throw new Error('Invalid first name');
      const payload = { firstName: first, lastName: last };
      if (nameWaiter) {
        nameWaiter.resolve(payload);
        nameWaiter = null;
        return;
      }
      pendingName = payload;
    },

    async logOut() {
      if (closed) return;
      try {
        await client.invoke({ _: 'logOut' });
      } catch {
        /* ignore */
      }
    },

    async close() {
      closed = true;
      rejectAllQueues('closed');
    },
  };
}

module.exports = { createInteractiveAuth };
