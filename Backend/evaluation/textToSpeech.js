/**
 * textToSpeech.js — Deepgram TTS (text → mp3 audio).
 * Key: process.env.DEEP_GRAM
 */

const DG_URL = "https://api.deepgram.com/v1/speak";
const TTS_VOICE = "aura-2-thalia-en";
const MAX_CHARS = 2000; // Deepgram per-request text limit

/**
 * @param {string} text
 * @param {string} [voice]
 * @returns {Promise<Buffer>} mp3 audio
 */
export async function textToSpeech(text, voice = TTS_VOICE) {
  const key = process.env.DEEP_GRAM;
  if (!key) throw new Error("DEEP_GRAM key missing in .env");

  const clean = String(text || "").trim().slice(0, MAX_CHARS);
  if (!clean) throw new Error("Empty text");

  const params = new URLSearchParams({ model: voice, encoding: "mp3" });

  const res = await fetch(`${DG_URL}?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: clean }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Deepgram TTS failed (${res.status}): ${msg.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export default textToSpeech;
