import "dotenv/config";
import mongoose from "mongoose";
const cwd = process.cwd();
const { default: connectDB } = await import(cwd + "/models/MongoConnect.js");
const { default: VA } = await import(cwd + "/evaluation/vivaAssignment.js");
const { default: Topic } = await import(cwd + "/models/topic.js");
const { default: PS } = await import(cwd + "/models/permissionSection.js");
await connectDB();
const a = await VA.findOne().sort({ createdAt: -1 }).lean();
console.log("assignment", { fileId: a.fileId, sectionId: a.sectionId });
const sec = await PS.findById(a.sectionId).lean();
console.log("section", { title: sec?.title, ps: sec?.pageStart, pe: sec?.pageEnd, status: sec?.parseStatus });
const all = await Topic.find({ fileId: a.fileId }).select("sectionId isChunk level content summary pageStart pageEnd").lean();
const agg = {};
for (const t of all) {
  const k = `${t.sectionId || "null"}|chunk=${!!t.isChunk}`;
  agg[k] ??= { n: 0, withText80: 0, pages: new Set() };
  agg[k].n++;
  if (((t.content || "") + (t.summary || "")).trim().length > 80) agg[k].withText80++;
  agg[k].pages.add(`${t.pageStart}-${t.pageEnd}`);
}
for (const [k, v] of Object.entries(agg)) console.log(k, v.n, "text>80:", v.withText80, "pages:", [...v.pages].slice(0, 6).join(","));
process.exit(0);
