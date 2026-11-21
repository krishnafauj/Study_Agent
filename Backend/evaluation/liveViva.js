/**
 * liveViva.js — real-time voice viva over WebSocket.
 *
 * Browser captures the mic (getUserMedia / MediaRecorder, webm-opus) and streams
 * chunks here; this server relays them to Deepgram live STT (key never leaves
 * the server), streams captions back, detects end of answer, grades with the
 * AI brain and speaks the feedback + next question via Deepgram TTS.
 *
 *   ws(s)://<api>/ws/viva?token=<JWT>&sessionId=<id>
 *
 * Client → server
 *   binary                         audio chunk of the current answer
 *   {type:"answer_start"}          student starts answering (new MediaRecorder)
 *   {type:"answer_end"}            student pressed "Done"
 *   {type:"answer_cancel"}         drop the current answer without grading
 *   {type:"repeat"}                speak the current question again
 *   {type:"proctor", event:"fullscreen_exit"|"tab_hidden"}
 *
 * Server → client
 *   {type:"state", session}                         public session view
 *   {type:"speak", text, audio(base64 mp3), next:"answer"|"done"}
 *   {type:"transcript", text, isFinal}              live captions
 *   {type:"thinking"}                               grading in progress
 *   {type:"evaluated", evaluated, session}
 *   {type:"completed", session}
 *   {type:"error", message}
 */
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import EvaluationSession from "./evaluationSession.js";
import { textToSpeech } from "./textToSpeech.js";
import { submitAnswer, publicView } from "./evaluation.js";

const DG_LIVE = "wss://api.deepgram.com/v1/listen";
const SILENCE_MS = 3500;     // auto-submit after this much silence once the student has spoken
const DEFAULT_ANSWER_SEC = 90; // per-answer cap unless the assignment sets one
const FINAL_FLUSH_MS = 1500; // wait for Deepgram's last results after closing

function openDeepgram() {
  const params = new URLSearchParams({
    model: "nova-3",
    language: "en",
    smart_format: "true",
    punctuate: "true",
    interim_results: "true",
    endpointing: "300",
  });
  return new WebSocket(`${DG_LIVE}?${params}`, {
    headers: { Authorization: `Token ${process.env.DEEP_GRAM}` },
  });
}

async function speakPayload(text, next) {
  let audio = null;
  try {
    audio = (await textToSpeech(text)).toString("base64");
  } catch (e) {
    console.warn("[liveViva] TTS failed, client will fall back to text:", e.message);
  }
  return { type: "speak", text, audio, next };
}

export function attachLiveViva(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname !== "/ws/viva") return; // let other upgrade handlers (if any) deal with it
    try {
      const user = jwt.verify(url.searchParams.get("token") || "", process.env.JWT_SECRET);
      const sessionId = url.searchParams.get("sessionId");
      if (!mongoose.isValidObjectId(sessionId)) throw new Error("bad session");
      wss.handleUpgrade(req, socket, head, (ws) => handle(ws, String(user.userId), sessionId));
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    }
  });

  console.log("🎙️  Live viva WebSocket ready at /ws/viva");
}

async function handle(ws, userId, sessionId) {
  const send = (obj) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(obj));

  let session = await EvaluationSession.findOne({ _id: sessionId, userId });
  if (!session) {
    send({ type: "error", message: "Viva session not found" });
    return ws.close();
  }

  // ── per-answer state ──
  let dg = null;
  let pending = [];      // audio chunks received before Deepgram is open
  let finals = [];       // finalized transcript pieces
  let interim = "";
  let silenceTimer = null;
  let capTimer = null;
  let answering = false;
  let busy = false;      // grading / speaking

  const clearTimers = () => {
    clearTimeout(silenceTimer);
    clearTimeout(capTimer);
    silenceTimer = capTimer = null;
  };

  const currentQuestionText = () => session.questions[session.currentIndex]?.question || "";

  async function speakQuestion(prefix = "") {
    const q = currentQuestionText();
    const n = session.currentIndex + 1;
    const text = `${prefix}${prefix ? " " : ""}Question ${n} of ${session.questions.length}. ${q}`;
    send(await speakPayload(text, "answer"));
  }

  function startAnswer() {
    if (busy || answering || session.status !== "in_progress") return;
    answering = true;
    finals = [];
    interim = "";
    pending = [];

    dg = openDeepgram();
    dg.on("open", () => {
      pending.forEach((c) => dg.send(c));
      pending = [];
    });
    dg.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type !== "Results") return;
      const text = msg.channel?.alternatives?.[0]?.transcript || "";
      if (msg.is_final) {
        if (text) finals.push(text);
        interim = "";
      } else {
        interim = text;
      }
      const full = [...finals, interim].filter(Boolean).join(" ");
      send({ type: "transcript", text: full, isFinal: !!msg.is_final });

      if (text) {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => endAnswer("silence"), SILENCE_MS);
      }
    });
    dg.on("error", (e) => {
      console.error("[liveViva] Deepgram error:", e.message);
      send({ type: "error", message: "Speech service error, please press Done and retry" });
    });

    capTimer = setTimeout(() => endAnswer("timeout"), (session.answerTimeSec || DEFAULT_ANSWER_SEC) * 1000);
  }

  async function closeDeepgram() {
    const conn = dg;
    dg = null;
    if (!conn) return;
    await new Promise((resolve) => {
      const done = () => resolve();
      const t = setTimeout(done, FINAL_FLUSH_MS);
      conn.once("close", () => { clearTimeout(t); done(); });
      if (conn.readyState === WebSocket.OPEN) conn.send(JSON.stringify({ type: "CloseStream" }));
      else if (conn.readyState === WebSocket.CONNECTING) conn.once("open", () => conn.send(JSON.stringify({ type: "CloseStream" })));
      else done();
    });
    try { conn.terminate(); } catch { /* ignore */ }
  }

  async function endAnswer(reason) {
    if (!answering) return;
    answering = false;
    busy = true;
    clearTimers();
    send({ type: "thinking", reason });

    try {
      await closeDeepgram();
      const transcript = [...finals, interim].filter(Boolean).join(" ").trim();

      const result = await submitAnswer({ sessionId, userId, transcript });
      session = result.session;
      send({ type: "evaluated", transcript, evaluated: result.evaluated, session: publicView(session) });

      if (session.status === "completed") {
        send({ type: "completed", session: publicView(session) });
        const summary = session.report?.summary || `You scored ${session.totalScore} out of ${session.maxScore}.`;
        send(await speakPayload(`${result.evaluated.feedback} That was the last question. ${summary}`, "done"));
      } else {
        await speakQuestion(result.evaluated.feedback || "");
      }
    } catch (e) {
      console.error("[liveViva] grading failed:", e.message);
      send({ type: "error", message: "Could not evaluate that answer. Please answer again." });
    } finally {
      busy = false;
    }
  }

  ws.on("message", async (data, isBinary) => {
    if (isBinary) {
      if (!answering) return;
      if (dg?.readyState === WebSocket.OPEN) dg.send(data);
      else pending.push(data);
      return;
    }
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    switch (msg.type) {
      case "answer_start":
        startAnswer();
        break;
      case "answer_end":
        endAnswer("manual");
        break;
      case "answer_cancel":
        if (answering) {
          answering = false;
          clearTimers();
          await closeDeepgram();
        }
        break;
      case "repeat":
        if (!busy && !answering && session.status === "in_progress") await speakQuestion();
        break;
      case "proctor": {
        const field = msg.event === "fullscreen_exit" ? "fullscreenExits" : msg.event === "tab_hidden" ? "tabSwitches" : null;
        if (field) {
          await EvaluationSession.updateOne({ _id: sessionId }, { $inc: { [field]: 1 } });
          session[field] = (session[field] || 0) + 1;
        }
        break;
      }
    }
  });

  ws.on("close", async () => {
    clearTimers();
    answering = false;
    await closeDeepgram().catch(() => {});
  });

  // ── greet ──
  send({ type: "state", session: publicView(session) });
  if (session.status === "completed") {
    send({ type: "completed", session: publicView(session) });
  } else {
    const intro = session.currentIndex === 0
      ? "Hi! I'm your viva examiner. I'll ask you a few questions. Answer out loud, and press Done when you finish, or just pause for a few seconds."
      : "Welcome back. Let's continue.";
    await speakQuestion(intro);
  }
}

export default attachLiveViva;
