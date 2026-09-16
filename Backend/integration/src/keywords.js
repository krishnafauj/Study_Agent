// Lightweight, dependency-free keyword extraction (frequency + phrase heuristics).
const STOP = new Set(`a an the of to in on for and or but if then else when while is are was were be been being
this that these those with without within into onto from as at by it its it's we you they he she i our your their
which who whom whose what where why how not no yes can could should would may might must will shall do does did done
has have had having also more most such than very just only own same so too s t can't don't chapter figure table
example exercise section page questions question answer solution following given above below each other some any all`.split(/\s+/));

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z][a-z\-']{2,}/g) || []).filter((w) => !STOP.has(w));
}

export function extractKeywords(text, n = 8) {
  const clean = String(text || "").replace(/\[\[[^\]]+\]\]/g, " ");
  const tokens = tokenize(clean);
  if (!tokens.length) return [];

  // unigram frequencies
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);

  // capitalized multi-word phrases from the ORIGINAL text (proper nouns / terms)
  const phrases = new Map();
  const capSeq = clean.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g) || [];
  for (const p of capSeq) {
    const key = p.trim();
    if (key.split(/\s+/).every((w) => STOP.has(w.toLowerCase()))) continue;
    phrases.set(key, (phrases.get(key) || 0) + 2); // weight phrases higher
  }

  const scored = [
    ...[...phrases.entries()].map(([k, v]) => [k, v]),
    ...[...freq.entries()].map(([k, v]) => [k, v]),
  ];
  const seen = new Set();
  return scored
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .filter((k) => {
      const low = k.toLowerCase();
      if (seen.has(low)) return false;
      seen.add(low);
      return true;
    })
    .slice(0, n);
}
