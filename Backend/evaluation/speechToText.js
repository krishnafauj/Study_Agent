/**
 * speechToText.js — Deepgram STT (pre-recorded audio → text).
 * Uses the REST API directly (Node 20 fetch), so no extra SDK is needed.
 * Key: process.env.DEEP_GRAM
 */

const DG_URL = "https://api.deepgram.com/v1/listen";
const STT_MODEL = "nova-3";

/**
 * @param {Buffer} audioBuffer  raw audio (webm/ogg/wav/mp3/m4a…)
 * @param {string} mimeType     e.g. "audio/webm"
 * @returns {Promise<{ transcript: string, confidence: number, durationSec: number }>}
 */
export async function speechToText(audioBuffer, mimeType = "audio/webm") {
  const key = process.env.DEEP_GRAM;
  if (!key) throw new Error("DEEP_GRAM key missing in .env");
  if (!audioBuffer?.length) throw new Error("Empty audio");

  const params = new URLSearchParams({
    model: STT_MODEL,
    smart_format: "true",
    punctuate: "true",
    language: "en",
  });

  const res = await fetch(`${DG_URL}?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": mimeType,
    },
    body: audioBuffer,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Deepgram STT failed (${res.status}): ${msg.slice(0, 200)}`);
  }

  const data = await res.json();
  const alt = data?.results?.channels?.[0]?.alternatives?.[0] || {};

  return {
    transcript: (alt.transcript || "").trim(),
    confidence: alt.confidence ?? 0,
    durationSec: data?.metadata?.duration ?? 0,
  };
}

export default speechToText;
