/**
 * langfuse.js — one shared Langfuse LangChain callback handler for the whole
 * backend. Attach `lfCallbacks()` to any LangChain model .invoke()/.stream()
 * call and the run shows up as a trace in Langfuse.
 *
 * If the LANGFUSE_* env vars are missing, this degrades to a no-op so the app
 * keeps working without tracing.
 *
 * Env: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL
 */

import { CallbackHandler } from "langfuse-langchain";

let _handler = null;
let _initTried = false;

export function langfuseHandler() {
  if (_initTried) return _handler;
  _initTried = true;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    console.warn("[langfuse] keys not set — tracing disabled");
    return null;
  }

  try {
    _handler = new CallbackHandler({
      publicKey,
      secretKey,
      // Accept either spelling; the JS SDK's own env var is LANGFUSE_BASEURL.
      baseUrl:
        process.env.LANGFUSE_BASE_URL ||
        process.env.LANGFUSE_BASEURL ||
        "https://cloud.langfuse.com",
    });
    console.log("[langfuse] tracing enabled");
  } catch (err) {
    console.warn("[langfuse] failed to init, tracing disabled:", err.message);
    _handler = null;
  }
  return _handler;
}

/**
 * Callbacks array to spread into a LangChain call config.
 * @param {object} [opts]
 * @param {string} [opts.userId]     tag the trace with a user
 * @param {string} [opts.sessionId]  group calls of the same chat together
 * @returns {{ callbacks: any[], metadata?: object }}
 */
export function lfConfig(opts = {}) {
  const h = langfuseHandler();
  if (!h) return {};
  const metadata = {};
  if (opts.userId) metadata.langfuseUserId = String(opts.userId);
  if (opts.sessionId) metadata.langfuseSessionId = String(opts.sessionId);
  return { callbacks: [h], ...(Object.keys(metadata).length ? { metadata } : {}) };
}

/** Just the callbacks array (no metadata). */
export function lfCallbacks() {
  const h = langfuseHandler();
  return h ? [h] : [];
}

export default { langfuseHandler, lfConfig, lfCallbacks };
