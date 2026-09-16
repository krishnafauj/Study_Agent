/**
 * accessRoutes.js
 *
 * Page-range permission sections + per-user grants (with Assign/See mode) +
 * scoped chat context. Mounted in Route.js AFTER the global verifyToken.
 *
 *   mode "assign" → section pages are parsed; student can chat about them.
 *   mode "see"    → student can view the section's topics read-only; not parsed.
 *
 * Assigned-users management (add/revoke emails + assignment email) stays on the
 * existing /files/:id/assign and /files/:id/revoke routes. This router owns the
 * SECTION and GRANT layer plus the caller's scope resolution.
 *
 * The JWT carries `email` (see Auth/auth.js), so req.user.email is reliable.
 */

import express from "express";
import mongoose from "mongoose";
import UserFile from "../models/userFile.js";
import PermissionSection from "../models/permissionSection.js";
import SectionGrant from "../models/sectionGrant.js";
import { buildConceptEdges } from "../services/knowledgeGraphService.js";
import { getScopedGraphContext } from "../services/scopedRetrievalService.js";

const router = express.Router();

// ─────────────────────────── helpers ───────────────────────────

async function loadFile(fileId) {
  if (!mongoose.isValidObjectId(fileId)) return null;
  return UserFile.findById(fileId).select("_id userId fileName assignedTo").lean();
}

function callerEmail(req) {
  return req.user?.email ? String(req.user.email).toLowerCase() : null;
}

function isOwnerOf(file, req) {
  return String(file.userId) === String(req.user.userId);
}

function requireOwner(file, req, res) {
  if (!isOwnerOf(file, req)) {
    res.status(403).json({ success: false, error: "Only the file owner can do that" });
    return false;
  }
  return true;
}

/**
 * Resolve the caller's scope for a file, server-side.
 * Returns { isOwner, sections:[{_id,title,pageStart,pageEnd,mode}], grant }.
 *   - Owner ⇒ every section, mode "assign".
 *   - Granted user ⇒ only their granted sections, each with its mode.
 */
async function resolveCallerScope(file, req) {
  if (isOwnerOf(file, req)) {
    const sections = await PermissionSection.find({ fileId: String(file._id) })
      .sort({ order: 1 })
      .lean();
    return {
      isOwner: true,
      sections: sections.map((s) => ({ ...s, mode: "assign" })),
      grant: null,
    };
  }

  const email = callerEmail(req);
  const grant = await SectionGrant.findOne({
    fileId: String(file._id),
    status: "active",
    $or: [
      ...(email ? [{ grantedToEmail: email }] : []),
      { grantedToUserId: String(req.user.userId) },
    ],
  }).lean();

  if (!grant) return { isOwner: false, sections: [], grant: null };

  const ids = (grant.sections || []).map((s) => s.sectionId);
  const modeById = new Map((grant.sections || []).map((s) => [String(s.sectionId), s.mode]));
  const sections = await PermissionSection.find({ _id: { $in: ids } }).lean();

  return {
    isOwner: false,
    sections: sections.map((s) => ({ ...s, mode: modeById.get(String(s._id)) || "assign" })),
    grant,
  };
}

// Only "assign"-mode sections are parsed into chat.
const assignRanges = (sections) =>
  sections
    .filter((s) => s.mode === "assign")
    .map((s) => ({ pageStart: s.pageStart, pageEnd: s.pageEnd }));

// ─────────────────────── overview (owner console) ───────────────────────

router.get("/access/:fileId/overview", async (req, res) => {
  try {
    const file = await loadFile(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, error: "File not found" });

    const isOwner = isOwnerOf(file, req);

    // Non-owner ⇒ read-only "your access" view.
    if (!isOwner) {
      const scope = await resolveCallerScope(file, req);
      return res.json({
        success: true,
        isOwner: false,
        fileName: file.fileName,
        mySections: scope.sections.map((s) => ({
          _id: s._id, title: s.title, pageStart: s.pageStart, pageEnd: s.pageEnd, mode: s.mode,
        })),
      });
    }

    const [sections, grants] = await Promise.all([
      PermissionSection.find({ fileId: String(file._id) }).sort({ order: 1 }).lean(),
      SectionGrant.find({ fileId: String(file._id), status: "active" }).lean(),
    ]);

    // Shape grants keyed by email → { sectionId: mode }
    const grantByEmail = {};
    for (const g of grants) {
      grantByEmail[g.grantedToEmail] = {};
      for (const s of g.sections || []) grantByEmail[g.grantedToEmail][String(s.sectionId)] = s.mode;
    }

    res.json({
      success: true,
      isOwner: true,
      fileName: file.fileName,
      assignedTo: file.assignedTo || [],
      sections,
      grantByEmail,
    });
  } catch (err) {
    console.error("[access] overview:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────── permission sections ───────────────────────

router.post("/access/:fileId/sections", async (req, res) => {
  try {
    const file = await loadFile(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, error: "File not found" });
    if (!requireOwner(file, req, res)) return;

    const { title, pageStart, pageEnd, order } = req.body || {};
    if (!title || !Number(pageStart) || !Number(pageEnd)) {
      return res.status(400).json({ success: false, error: "title, pageStart, pageEnd required" });
    }
    if (Number(pageEnd) < Number(pageStart)) {
      return res.status(400).json({ success: false, error: "pageEnd must be >= pageStart" });
    }

    const section = await PermissionSection.create({
      fileId: String(file._id),
      userId: String(req.user.userId),
      title: String(title),
      pageStart: Number(pageStart),
      pageEnd: Number(pageEnd),
      order: Number(order) || 0,
    });
    res.json({ success: true, section });
  } catch (err) {
    console.error("[access] create section:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/access/:fileId/sections/:sectionId", async (req, res) => {
  try {
    const file = await loadFile(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, error: "File not found" });
    if (!requireOwner(file, req, res)) return;

    await PermissionSection.deleteOne({ _id: req.params.sectionId, fileId: String(file._id) });
    // Pull the section out of every grant.
    await SectionGrant.updateMany(
      { fileId: String(file._id) },
      { $pull: { sections: { sectionId: req.params.sectionId } } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────── grants ───────────────────────────

// Set a user's section permissions. Body: { email, sections: [{ sectionId, mode }] }
router.post("/access/:fileId/grants", async (req, res) => {
  try {
    const file = await loadFile(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, error: "File not found" });
    if (!requireOwner(file, req, res)) return;

    const { email, sections } = req.body || {};
    if (!email || !Array.isArray(sections)) {
      return res.status(400).json({ success: false, error: "email and sections[] required" });
    }

    // Keep only sections that belong to this file; normalize mode.
    const owned = await PermissionSection.find({ fileId: String(file._id) }).select("_id").lean();
    const ownedIds = new Set(owned.map((s) => String(s._id)));
    const clean = sections
      .filter((s) => s && ownedIds.has(String(s.sectionId)))
      .map((s) => ({
        sectionId: s.sectionId,
        mode: s.mode === "see" ? "see" : "assign",
      }));

    const grant = await SectionGrant.findOneAndUpdate(
      { fileId: String(file._id), grantedToEmail: String(email).toLowerCase().trim() },
      {
        fileId: String(file._id),
        grantedToEmail: String(email).toLowerCase().trim(),
        sections: clean,
        grantedBy: String(req.user.userId),
        status: "active",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, grant });
  } catch (err) {
    console.error("[access] create grant:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/access/:fileId/grants", async (req, res) => {
  try {
    const file = await loadFile(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, error: "File not found" });
    if (!requireOwner(file, req, res)) return;

    const grants = await SectionGrant.find({ fileId: String(file._id) })
      .populate("sections.sectionId", "title pageStart pageEnd")
      .lean();
    res.json({ success: true, grants });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/access/:fileId/grants/:grantId", async (req, res) => {
  try {
    const file = await loadFile(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, error: "File not found" });
    if (!requireOwner(file, req, res)) return;

    await SectionGrant.updateOne(
      { _id: req.params.grantId, fileId: String(file._id) },
      { $set: { status: "revoked" } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────── caller scope + graph ───────────────────────

// What sections can the CALLER access, and at what mode? (owner ⇒ full)
router.get("/access/:fileId/my-scope", async (req, res) => {
  try {
    const file = await loadFile(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, error: "File not found" });

    const scope = await resolveCallerScope(file, req);
    res.json({
      success: true,
      isOwner: scope.isOwner,
      hasAccess: scope.isOwner || !!scope.grant,
      sections: scope.sections.map((s) => ({
        _id: s._id, title: s.title, pageStart: s.pageStart, pageEnd: s.pageEnd, mode: s.mode,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/access/:fileId/graph/build", async (req, res) => {
  try {
    const file = await loadFile(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, error: "File not found" });
    if (!requireOwner(file, req, res)) return;

    const useLlm = Boolean(req.body?.useLlm);
    const stats = await buildConceptEdges(String(file._id), { useLlm });
    res.json({ success: true, stats });
  } catch (err) {
    console.error("[access] graph build:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Scoped chat context — only "assign"-mode sections are parsed.
router.post("/access/:fileId/scoped-context", async (req, res) => {
  try {
    const file = await loadFile(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, error: "File not found" });

    const { message } = req.body || {};
    if (!message) return res.status(400).json({ success: false, error: "message required" });

    const scope = await resolveCallerScope(file, req);
    if (!scope.isOwner && !scope.grant) {
      return res.status(403).json({ success: false, error: "No access to this file" });
    }

    const context = await getScopedGraphContext(
      message,
      String(file._id),
      assignRanges(scope.sections), // parse only Assign-mode pages
      { limit: 6, prereqCap: 3 }
    );
    res.json({ success: true, context });
  } catch (err) {
    console.error("[access] scoped-context:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
