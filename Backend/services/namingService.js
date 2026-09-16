import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const warn = (s, m, e = null) => e ? console.warn(`⚠️  [${s}]`, m, e) : console.warn(`⚠️  [${s}]`, m);

export async function extractFirstPageText(buffer) {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    });
    const pdf = await loadingTask.promise;
    if (pdf.numPages === 0) return "";

    const page = await pdf.getPage(1);
    const content = await page.getTextContent({ normalizeWhitespace: true });

    // Get items and sort them roughly by y then x
    const items = content.items
      .filter(item => item.str && item.str.trim() !== "")
      .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);

    return items.map(item => item.str).join(" ").trim();
  } catch (err) {
    warn("DYNAMIC_NAME", `Failed to extract first page: ${err.message}`);
    return "";
  }
}

export function deriveDynamicFileName(text, originalName) {
  if (!text || text.trim().length === 0) return originalName;

  // Clean text: remove multiple spaces, newlines, etc.
  const cleaned = text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return originalName;

  // Extract the first ~8 words
  const words = cleaned.split(" ").slice(0, 8);
  let name = words.join(" ");

  // Sanitize for filename (remove invalid chars)
  name = name.replace(/[<>:"/\\|?*]+/g, "").trim();

  if (name.length === 0) return originalName;

  return `${name}.pdf`;
}
