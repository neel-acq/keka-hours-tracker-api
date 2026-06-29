function isDebugLoggingEnabled() {
  const flag = process.env.DEBUG_LOGGING;
  return (
    flag === 'true' ||
    flag === '1' ||
    process.env.NODE_ENV === 'development'
  );
}

export function createLogger(namespace) {
  function log(...args) {
    if (isDebugLoggingEnabled()) console.log(namespace, ...args);
  }

  function warn(...args) {
    if (isDebugLoggingEnabled()) console.warn(namespace, ...args);
  }

  function error(...args) {
    if (isDebugLoggingEnabled()) console.error(namespace, ...args);
  }

  return { log, warn, error };
}

export const logger = createLogger('[API]');
