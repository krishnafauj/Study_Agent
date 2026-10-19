import express from "express";
import mongoose from "mongoose";
import StudentGroup from "../models/studentGroup.js";

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MEMBERS = 2000;

/**
 * Normalise + validate an incoming members array.
 * Returns { members, invalid } — duplicates (by email) are dropped silently,
 * invalid emails are reported back so the client can highlight them.
 */
function cleanMembers(raw) {
  if (!Array.isArray(raw)) return { members: [], invalid: [] };
  const seen = new Set();
  const members = [];
  const invalid = [];
  raw.forEach((m, i) => {
    const email = String(m?.email ?? "").trim().toLowerCase();
    const name = String(m?.name ?? "").trim().slice(0, 120);
    if (!email && !name) return; // blank row
    if (!EMAIL_RE.test(email)) { invalid.push({ row: i + 1, email, name }); return; }
    if (seen.has(email)) return;
    seen.add(email);
    members.push({ name, email });
  });
  return { members, invalid };
}

const isId = (id) => mongoose.Types.ObjectId.isValid(id);

// GET /api/groups — all groups I own (summary, no member list)
router.get("/groups", async (req, res) => {
  try {
    const ownerId = String(req.user.userId);
    const groups = await StudentGroup.aggregate([
      { $match: { ownerId } },
      { $sort: { updatedAt: -1 } },
      {
        $project: {
          name: 1, description: 1, createdAt: 1, updatedAt: 1,
          memberCount: { $size: "$members" },
        },
      },
    ]);
    res.json({ success: true, groups });
  } catch (err) {
    console.error("GET /groups error:", err);
    res.status(500).json({ success: false, message: "Failed to load groups" });
  }
});

// GET /api/groups/:groupId — one group with members
router.get("/groups/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isId(groupId)) return res.status(400).json({ success: false, message: "Invalid group id" });
    const group = await StudentGroup.findOne({ _id: groupId, ownerId: String(req.user.userId) }).lean();
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });
    res.json({ success: true, group });
  } catch (err) {
    console.error("GET /groups/:id error:", err);
    res.status(500).json({ success: false, message: "Failed to load group" });
  }
});

// POST /api/groups — create { name, description?, members: [{ name, email }] }
router.post("/groups", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Group name is required" });

    const { members, invalid } = cleanMembers(req.body?.members);
    if (invalid.length) {
      return res.status(400).json({ success: false, message: "Some emails are invalid", invalid });
    }
    if (members.length > MAX_MEMBERS) {
      return res.status(400).json({ success: false, message: `A group can have at most ${MAX_MEMBERS} members` });
    }

    const group = await StudentGroup.create({
      ownerId: String(req.user.userId),
      name,
      description: String(req.body?.description ?? "").trim(),
      members,
    });
    res.status(201).json({ success: true, group });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: "You already have a group with this name" });
    }
    console.error("POST /groups error:", err);
    res.status(500).json({ success: false, message: "Failed to create group" });
  }
});

// PATCH /api/groups/:groupId — update any of { name, description, members }
// `members`, when sent, REPLACES the full list.
router.patch("/groups/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isId(groupId)) return res.status(400).json({ success: false, message: "Invalid group id" });

    const update = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ success: false, message: "Group name cannot be empty" });
      update.name = name;
    }
    if (req.body?.description !== undefined) update.description = String(req.body.description).trim();
    if (req.body?.members !== undefined) {
      const { members, invalid } = cleanMembers(req.body.members);
      if (invalid.length) {
        return res.status(400).json({ success: false, message: "Some emails are invalid", invalid });
      }
      if (members.length > MAX_MEMBERS) {
        return res.status(400).json({ success: false, message: `A group can have at most ${MAX_MEMBERS} members` });
      }
      update.members = members;
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ success: false, message: "Nothing to update" });
    }

    const group = await StudentGroup.findOneAndUpdate(
      { _id: groupId, ownerId: String(req.user.userId) },
      { $set: update },
      { new: true, runValidators: true }
    ).lean();
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });
    res.json({ success: true, group });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: "You already have a group with this name" });
    }
    console.error("PATCH /groups/:id error:", err);
    res.status(500).json({ success: false, message: "Failed to update group" });
  }
});

// DELETE /api/groups/:groupId
router.delete("/groups/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isId(groupId)) return res.status(400).json({ success: false, message: "Invalid group id" });
    const deleted = await StudentGroup.findOneAndDelete({ _id: groupId, ownerId: String(req.user.userId) });
    if (!deleted) return res.status(404).json({ success: false, message: "Group not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /groups/:id error:", err);
    res.status(500).json({ success: false, message: "Failed to delete group" });
  }
});

export default router;
