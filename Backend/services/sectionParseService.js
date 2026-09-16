/**
 * sectionParseService.js
 *
 * Parses ONE PermissionSection's page range on demand — the core of the
 * "parse topic by topic, not the whole PDF at once" model.
 *
 * Triggered when a section is created (see accessRoutes.js POST /sections) and
 * by the manual re-parse route. It:
 *   1. fetches the PDF from S3,
 *   2. extracts ONLY the section's pages (pdfjs-dist, no whole-doc parse, no trim),
 *   3. runs LLM structure extraction + embeddings on just that range,
 *   4. saves Topic docs stamped with sectionId + real pageStart/pageEnd,
 *   5. tracks progress/status on the section itself.
 *
 * Because chunks now carry real page numbers, scopedRetrievalService's
 * page-range scoping works correctly (it excluded pageStart/pageEnd=0 chunks).
 */

import UserFile from "../models/userFile.js";
import Topic from "../models/topic.js";
import PermissionSection from "../models/permissionSection.js";
import { getFileBuffer } from "./s3Service.js";
import { processPageRange } from "../integration/src/pipeline.js";

/**
 * Parse a single section by id. Idempotent: re-running clears the section's old
 * topics first. Throws on failure (also records parseStatus="failed").
 * @returns {Promise<{topicsCreated:number}>}
 */
export async function parseSection(sectionId) {
  const section = await PermissionSection.findById(sectionId);
  if (!section) {
    console.warn(`[sectionParse] section ${sectionId} not found`);
    return { topicsCreated: 0 };
  }

  const file = await UserFile.findById(section.fileId).lean();
  if (!file || !file.s3Key) {
    await PermissionSection.updateOne(
      { _id: section._id },
      { parseStatus: "failed", parseError: "Source file not found" }
    );
    return { topicsCreated: 0 };
  }

  try {
    await PermissionSection.updateOne(
      { _id: section._id },
      { parseStatus: "parsing", parseProgress: 0, parseError: null }
    );

    // Idempotent re-parse: drop any topics previously parsed for THIS section.
    await Topic.deleteMany({ sectionId: section._id });

    console.log(
      `\n📖 [SECTION-PARSE] "${section.title}" pages ${section.pageStart}-${section.pageEnd} (file ${file._id})`
    );

    const buffer = await getFileBuffer(file.s3Key);

    const result = await processPageRange(buffer, {
      pageStart: section.pageStart,
      pageEnd: section.pageEnd,
      sectionTitle: section.title,
      embed: true,
      progress: async (d) => {
        await PermissionSection.updateOne(
          { _id: section._id },
          { parseProgress: Math.round(d.progress || 0) }
        ).catch(() => {});
      },
    });

    // ── Save outline nodes + leaf chunks, stamped with sectionId ──
    let inserted = 0;
    const nodeMap = new Map();

    const insertOutline = async (nodes, parentId = null) => {
      for (const node of nodes) {
        const t = await Topic.create({
          fileId: String(file._id),
          userId: String(file.userId),
          sectionId: section._id,
          level: node.level,
          parentTopicId: parentId,
          title: node.title,
          summary: node.summary || "",
          content: node.title, // outline nodes have no large text
          keyConcepts: node.keyConcepts || [],
          formulas: node.formulas || [],
          mcqs: node.mcqs || [],
          embedding: [],
          order: inserted,
          number: node.number || "",
          isChunk: false,
          pageStart: node.pageStart || section.pageStart,
          pageEnd: node.pageEnd || section.pageEnd,
        });
        nodeMap.set(node.id, t._id);
        inserted++;
        if (node.children && node.children.length) {
          await insertOutline(node.children, t._id);
        }
      }
    };

    const insertChunks = async (chunks) => {
      for (const chunk of chunks) {
        const parentId = nodeMap.get(chunk.nodeId) || null;
        await Topic.create({
          fileId: String(file._id),
          userId: String(file.userId),
          sectionId: section._id,
          level: 99, // leaf chunk
          parentTopicId: parentId,
          title: chunk.title || "Content Chunk",
          summary: chunk.kind || "text",
          content: chunk.text,
          embedding: chunk.embedding || [],
          order: inserted,
          isChunk: true,
          contentType: chunk.contentType || "",
          pageStart: chunk.pageStart || section.pageStart,
          pageEnd: chunk.pageEnd || section.pageEnd,
        });
        inserted++;
      }
    };

    await insertOutline(result.outline);
    await insertChunks(result.chunks);

    await PermissionSection.updateOne(
      { _id: section._id },
      {
        parseStatus: "parsed",
        parseProgress: 100,
        topicsCreated: inserted,
        parsedAt: new Date(),
        parseError: null,
      }
    );

    console.log(`✅ [SECTION-PARSE] "${section.title}" → ${inserted} topics saved\n`);
    return { topicsCreated: inserted };
  } catch (err) {
    console.error(`❌ [SECTION-PARSE] "${section.title}" failed:`, err.message);
    await PermissionSection.updateOne(
      { _id: section._id },
      { parseStatus: "failed", parseError: err.message }
    ).catch(() => {});
    throw err;
  }
}

export default { parseSection };
