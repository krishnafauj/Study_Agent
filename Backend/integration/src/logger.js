// Minimal structured logger. Set LOG_LEVEL=debug|info|warn|error.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const CURRENT = LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? 20;

const ts = () => new Date().toISOString().slice(11, 23);
const fmt = (icon, scope, msg) => `${icon} ${ts()} [${scope}] ${msg}`;

export const logger = {
  debug: (scope, msg, extra) =>
    CURRENT <= 10 && console.log(fmt("·", scope, msg), extra ?? ""),
  info: (scope, msg, extra) =>
    CURRENT <= 20 && console.log(fmt("i", scope, msg), extra ?? ""),
  warn: (scope, msg, extra) =>
    CURRENT <= 30 && console.warn(fmt("!", scope, msg), extra ?? ""),
  error: (scope, msg, extra) =>
    CURRENT <= 40 && console.error(fmt("x", scope, msg), extra ?? ""),
};

export default logger;
