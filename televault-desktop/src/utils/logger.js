export const appLog = (level, msg) => {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  window.dispatchEvent(new CustomEvent('app-log', { detail: { level, msg, time } }));
};

let intercepted = false;
export function initConsoleInterceptor() {
  if (intercepted) return;
  intercepted = true;

  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;

  const safeStringify = (args) => {
    return args.map(a => {
      try {
        return typeof a === 'object' ? JSON.stringify(a) : String(a);
      } catch (e) {
        return String(a);
      }
    }).join(' ');
  };

  console.error = (...args) => {
    appLog('error', safeStringify(args));
    originalError(...args);
  };

  console.warn = (...args) => {
    appLog('warn', safeStringify(args));
    originalWarn(...args);
  };

  console.log = (...args) => {
    const msg = safeStringify(args);
    // Ignore vite/hmr spam
    if (!msg.includes('[vite]') && !msg.includes('Download the React DevTools')) {
      appLog('info', msg);
    }
    originalLog(...args);
  };

  window.addEventListener('error', (e) => {
    appLog('error', `Uncaught Error: ${e.message}`);
  });

  window.addEventListener('unhandledrejection', (e) => {
    appLog('error', `Unhandled Promise Rejection: ${e.reason}`);
  });
}
