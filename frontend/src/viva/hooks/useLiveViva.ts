// Live voice viva: mic → WebSocket → (server) Deepgram + AI brain → spoken reply.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { liveVivaUrl } from "../services";
import type { Evaluated, LivePhase, VivaSession } from "../types";

const pickMime = () => {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
};

export function useLiveViva(sessionId: string) {
  const [phase, setPhase] = useState<LivePhase>("ready");
  const [session, setSession] = useState<VivaSession | null>(null);
  const [aiText, setAiText] = useState("");
  const [caption, setCaption] = useState("");
  const [lastEvaluated, setLastEvaluated] = useState<(Evaluated & { transcript: string }) | null>(null);
  const [error, setError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [listenStartedAt, setListenStartedAt] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  const send = (obj: object) => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify(obj));

  // ── mic recording per answer ──
  const stopRecorder = useCallback(() => {
    const r = recRef.current;
    recRef.current = null;
    setListenStartedAt(null);
    if (r && r.state !== "inactive") r.stop();
  }, []);

  const startListening = useCallback(() => {
    const stream = streamRef.current;
    const ws = wsRef.current;
    if (!stream || !ws || ws.readyState !== WebSocket.OPEN || completedRef.current) return;
    setCaption("");
    send({ type: "answer_start" });
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };
    rec.start(250); // 250 ms chunks → near real-time captions
    recRef.current = rec;
    setListenStartedAt(Date.now());
    setPhase("listening");
  }, []);

  // ── AI speech playback ──
  const speak = useCallback(
    (text: string, audio: string | null, next: "answer" | "done") => {
      setAiText(text);
      setPhase("speaking");
      audioRef.current?.pause();
      const after = () => (next === "answer" ? startListening() : setPhase("completed"));
      if (!audio) {
        // TTS failed on the server → browser voice fallback
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(text);
          u.onend = after;
          window.speechSynthesis.speak(u);
        } else setTimeout(after, 1500);
        return;
      }
      const el = new Audio(`data:audio/mpeg;base64,${audio}`);
      audioRef.current = el;
      el.onended = after;
      el.play().catch(after);
    },
    [startListening]
  );

  // ── mic level meter (visual only) ──
  const startMeter = (stream: MediaStream) => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(buf);
      setMicLevel(buf.reduce((a, b) => a + b, 0) / buf.length / 128);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  // ── begin: needs a user gesture (fullscreen + mic + autoplay unlock) ──
  const begin = useCallback(
    async (container: HTMLElement | null) => {
      if (startedRef.current) return;
      setError("");
      try {
        await container?.requestFullscreen?.();
      } catch {
        return setError("Full screen is required to take this viva. Please allow it and try again.");
      }
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        return setError("Microphone access is required. Please allow the mic and try again.");
      }
      startMeter(streamRef.current);
      startedRef.current = true;
      setPhase("connecting");

      const ws = new WebSocket(liveVivaUrl(sessionId));
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        switch (msg.type) {
          case "state":
            setSession(msg.session);
            break;
          case "speak":
            speak(msg.text, msg.audio, msg.next);
            break;
          case "transcript":
            setCaption(msg.text);
            break;
          case "thinking":
            stopRecorder();
            setPhase("thinking");
            break;
          case "evaluated":
            setSession(msg.session);
            setLastEvaluated({ ...msg.evaluated, transcript: msg.transcript });
            break;
          case "completed":
            completedRef.current = true;
            setSession(msg.session);
            break;
          case "error":
            setError(msg.message);
            break;
        }
      };
      ws.onerror = () => setError("Connection error");
      ws.onclose = () => {
        stopRecorder();
        if (!completedRef.current) setPhase((p) => (p === "completed" ? p : "error"));
      };
    },
    [sessionId, speak, stopRecorder]
  );

  const done = useCallback(() => {
    if (phase !== "listening") return;
    stopRecorder();
    send({ type: "answer_end" });
  }, [phase, stopRecorder]);

  const repeat = useCallback(() => {
    if (phase !== "listening") return;
    stopRecorder();
    send({ type: "answer_cancel" }); // drop this answer, no grading
    send({ type: "repeat" });        // server re-speaks the question → listening restarts after it
  }, [phase, stopRecorder]);

  const enterFullscreen = useCallback((el: HTMLElement | null) => el?.requestFullscreen?.().catch(() => {}), []);

  // ── proctoring: full screen + tab visibility ──
  useEffect(() => {
    const onFs = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs && startedRef.current && !completedRef.current) send({ type: "proctor", event: "fullscreen_exit" });
    };
    const onVis = () => {
      if (document.hidden && startedRef.current && !completedRef.current) send({ type: "proctor", event: "tab_hidden" });
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // ── cleanup ──
  useEffect(
    () => () => {
      stopRecorder();
      wsRef.current?.close();
      audioRef.current?.pause();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
    [stopRecorder]
  );

  return { phase, session, aiText, caption, lastEvaluated, error, isFullscreen, micLevel, listenStartedAt, begin, done, repeat, enterFullscreen };
}
