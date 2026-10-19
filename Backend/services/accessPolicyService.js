/**
 * accessPolicyService.js
 *
 * Resolves the caller's PROGRESSIVE access map for one chat, server-side.
 * Replaces the old binary "accessible / not accessible" check.
 *
 * Every PermissionSection of the file gets exactly one tier:
 *
 *   FULL    — section granted in "assign" or "full" mode (or caller is the owner).
 *             Teach in depth: explanations, examples, code, solutions.
 *   BRIEF   — section granted in "see" mode. Outline is visible; chat may give
 *             only short definitions / intuition, never full walkthroughs.
 *   LOCKED  — no grant ("No access"). Nothing is retrieved from its pages; a
 *             concept from it may still be DEFINED minimally when a FULL topic
 *             depends on it (knowledge-graph prerequisite) or the student asks.
 *
 * On top of the tier, one section can be the chat's HOME (ChatSession.sectionId):
 * "in my home I am king" — home content is ranked first and used for vague
 * questions. If the home section itself is LOCKED, the chat degrades to
 * brief-only instead of silently continuing at full depth.
 *
 * The access map is ALWAYS derived from the DB grant — never from the client.
 */

import UserFile from "../models/userFile.js";
import SectionGrant from "../models/sectionGrant.js";
import PermissionSection from "../models/permissionSection.js";

export const TIER = Object.freeze({ FULL: "full", BRIEF: "brief", LOCKED: "locked" });

/**
 * @returns {Promise<null | {
 *   isOwner: boolean,
 *   fileName: string,
 *   hasGrant: boolean,
 *   sections: Array<{_id:string,title:string,pageStart:number,pageEnd:number,order:number,mode:string,tier:string,isHome:boolean}>,
 *   byId: Map<string, object>,
 *   homeSection: object|null,
 *   signature: string,
 * }>}
 */
export async function resolveChatAccess({ fileId, userId, userEmail, homeSectionId }) {
  if (!fileId) return null;

  const file = await UserFile.findById(fileId).select("userId fileName").lean().catch(() => null);
  if (!file) return null;

  const isOwner = String(file.userId) === String(userId);

  const all = await PermissionSection.find({ fileId: String(fileId) })
    .sort({ order: 1, pageStart: 1 })
    .select("_id title pageStart pageEnd order parseStatus")
    .lean();

  // sectionId -> "assign" | "full" | "see"
  const modeById = new Map();
  let hasGrant = false;

  if (isOwner) {
    for (const s of all) modeById.set(String(s._id), "assign");
  } else {
    const email = userEmail ? String(userEmail).toLowerCase() : null;
    const grant = await SectionGrant.findOne({
      fileId: String(fileId),
      status: "active",
      $or: [
        ...(email ? [{ grantedToEmail: email }] : []),
        { grantedToUserId: String(userId) },
      ],
    }).lean();
    if (grant) {
      hasGrant = true;
      for (const g of grant.sections || []) modeById.set(String(g.sectionId), g.mode || "assign");
    }
  }

  const home = homeSectionId ? String(homeSectionId) : null;

  const sections = all.map((s) => {
    const id = String(s._id);
    const mode = modeById.get(id) || "none";
    const tier = mode === "assign" || mode === "full" ? TIER.FULL : mode === "see" ? TIER.BRIEF : TIER.LOCKED;
    return {
      _id: id,
      title: s.title,
      pageStart: s.pageStart,
      pageEnd: s.pageEnd,
      order: s.order ?? 0,
      mode,
      tier,
      isHome: id === home,
    };
  });

  const byId = new Map(sections.map((s) => [s._id, s]));
  const homeSection = home ? byId.get(home) || null : null;

  // Changes whenever the owner changes this user's permissions → used to reset
  // chat memory so old full-depth answers don't leak after a downgrade.
  const signature = sections.map((s) => `${s._id}:${s.tier}`).join("|");

  return {
    isOwner,
    fileName: file.fileName || "Unknown File",
    hasGrant,
    sections,
    byId,
    homeSection,
    signature,
  };
}

/**
 * Which section does a Topic/chunk belong to?
 * Per-section parsing stamps `sectionId`; legacy whole-file topics fall back to
 * page-range containment. Returns null when unknown.
 */
export function sectionOfTopic(topic, access) {
  if (!topic || !access) return null;
  if (topic.sectionId) return access.byId.get(String(topic.sectionId)) || null;
  const ps = topic.pageStart || 0;
  const pe = topic.pageEnd || 0;
  if (!ps || !pe) return null;
  return access.sections.find((s) => ps >= s.pageStart && pe <= s.pageEnd) || null;
}

/** Tier of a topic. Unknown section ⇒ FULL for the owner, LOCKED for everyone else. */
export function tierOfTopic(topic, access) {
  const sec = sectionOfTopic(topic, access);
  if (sec) return sec.tier;
  return access?.isOwner ? TIER.FULL : TIER.LOCKED;
}

export default { TIER, resolveChatAccess, sectionOfTopic, tierOfTopic };
