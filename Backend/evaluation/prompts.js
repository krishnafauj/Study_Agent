/**
 * prompts.js — every prompt the viva agent uses lives here.
 * Edit wording here; evaluation.js only fills in the variables.
 */

export const EXAMINER_SYSTEM = `You are a friendly but rigorous oral examiner (viva) for a student.
You ONLY use the study material you are given. Never ask about or reward facts that are not in it.
Questions are spoken aloud, so keep them short, clear and conversational: no bullet points,
no code blocks, no LaTeX, no "Question 1:" prefixes.
Always reply with valid JSON only.`;

/**
 * Generate N viva questions from the student's material.
 * @param {{ material: string, count: number, difficulty: string }} v
 */
export const generateQuestionsPrompt = ({ material, count, difficulty }) => `
STUDY MATERIAL (each block starts with [T#] and its topic title):
${material}

Create exactly ${count} viva questions at "${difficulty}" difficulty.
Rules:
- Spread questions across different topics; at most one per topic unless there are fewer topics than questions.
- Mix types: definition, explain-why, compare, apply-to-example.
- Each question must be answerable in 30–60 seconds of speech.
- Write a concise reference answer (2–4 sentences) using ONLY the material.
- List 2–4 key points a good answer must mention.

Return JSON:
{
  "questions": [
    {
      "topicRef": "T1",
      "question": "spoken question text",
      "referenceAnswer": "model answer",
      "keyPoints": ["point 1", "point 2"]
    }
  ]
}`;

/**
 * Grade one spoken answer.
 * @param {{ question: string, referenceAnswer: string, keyPoints: string[], material: string, transcript: string }} v
 */
export const evaluateAnswerPrompt = ({ question, referenceAnswer, keyPoints, material, transcript }) => `
QUESTION: ${question}

REFERENCE ANSWER: ${referenceAnswer}

KEY POINTS: ${keyPoints.map((p, i) => `${i + 1}. ${p}`).join(" ")}

SOURCE MATERIAL:
${material}

STUDENT'S SPOKEN ANSWER (speech-to-text transcript, may contain small transcription errors; ignore filler words and grammar):
"${transcript}"

Grade the answer for understanding, not wording.
Scoring (0–10): 9–10 all key points, correct and clear; 6–8 most points, minor gaps;
3–5 partial or vague; 1–2 mostly wrong; 0 blank, off-topic or "I don't know".

Return JSON:
{
  "score": 0,
  "verdict": "correct" | "partial" | "incorrect",
  "coveredPoints": ["..."],
  "missingPoints": ["..."],
  "feedback": "2 short sentences spoken to the student: what was good, what was missing."
}`;

/**
 * Final report after the viva ends.
 * @param {{ results: Array<{ topic: string, question: string, score: number, missingPoints: string[] }>, total: number, max: number }} v
 */
export const finalReportPrompt = ({ results, total, max }) => `
VIVA RESULTS (score out of 10 each):
${results
  .map((r, i) => `${i + 1}. [${r.topic}] ${r.question} → ${r.score}/10; missed: ${r.missingPoints.join("; ") || "nothing"}`)
  .join("\n")}

TOTAL: ${total}/${max}

Write the final report for the student.
Return JSON:
{
  "summary": "3–4 sentences, encouraging and specific, suitable to be read aloud",
  "strengths": ["topic or skill"],
  "weakTopics": ["topic titles to revise"],
  "nextSteps": ["concrete revision action"]
}`;
