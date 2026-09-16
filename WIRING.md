# Wiring — 3 small, additive edits to existing files

The new feature is 6 new files. To turn it on, three existing files get a few
lines each. The owner's normal chat path is unchanged in every case.

---

## Edit 1 — register the router · `Backend/Route/Route.js`

Add the import near the other route imports:

```js
import accessRoutes from "./accessRoutes.js";
```

Add the mount alongside the other `router.use(...)` lines (after `router.use(verifyToken)`,
so it's protected like the rest):

```js
// Page-range access + knowledge-graph endpoints
router.use(accessRoutes);
```

---

## Edit 2 — build the graph once after processing · `Backend/Route/topicRoutes.js`

Add the import at the top:

```js
import { buildConceptEdges } from "../services/knowledgeGraphService.js";
```

In `processFileAsync`, right after the "completed" progress update
(around line 307–315, the `ProcessingProgress.updateOne({ ... status: "completed", progress: 100 ... })`
block), add:

```js
// Build the prerequisite knowledge graph once, after topics/chunks exist.
buildConceptEdges(fileId, { useLlm: false })
  .then((s) => console.log(`[graph] ${s.edges} edges over ${s.nodes} nodes for ${fileId}`))
  .catch((e) => console.warn("[graph] build failed:", e.message));
```

It runs in the background (not awaited) so it never delays the "done" response.
The owner can also rebuild anytime via `POST /api/access/:fileId/graph/build`.

---

## Edit 3 — scoped chat for granted (non-owner) users · `Backend/Route/chat/chatStreamController.js`

Today `buildSystemPrompt` always calls `getStructuredContext`. We add a scoped
branch for users who chat via a grant. The owner keeps the existing path.

**3a.** Add imports:

```js
import { getScopedGraphContext } from "../../services/scopedRetrievalService.js";
import UserFile from "../../models/userFile.js";
import SectionGrant from "../../models/sectionGrant.js";
import PermissionSection from "../../models/permissionSection.js";
```

**3b.** `buildSystemPrompt` needs to know who's asking. Change its signature to
accept the caller, and thread it through from the handler:

```js
// was: async function buildSystemPrompt({ message, fileId, conversationSummary }) {
async function buildSystemPrompt({ message, fileId, conversationSummary, userId, userEmail }) {
```

and where it's called (around line 186):

```js
const systemPromptText = await buildSystemPrompt({
  message,
  fileId: resolvedFileId,
  conversationSummary,          // (whatever you pass today)
  userId,                       // already in scope: const userId = req.user.userId
  userEmail: req.user?.email,   // may be undefined — see note
});
```

**3c.** Replace the RAG block (line ~77–92, the
`const { chunks, mode } = await getStructuredContext(message, fileId, 6);` block)
with a scope-aware version:

```js
// 3. RAG — scoped for granted users, full for the owner.
let chunks = [];
let mode = "vector";
let prereqBlock = "";

// Is this caller a non-owner accessing via a grant?
const file = await UserFile.findById(fileId).select("userId").lean();
const isOwner = file && String(file.userId) === String(userId);

if (file && !isOwner) {
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
    const secs = await PermissionSection.find({ _id: { $in: grant.sectionIds || [] } })
      .select("pageStart pageEnd").lean();
    const scoped = await getScopedGraphContext(
      message, fileId, secs.map((s) => ({ pageStart: s.pageStart, pageEnd: s.pageEnd })),
      { limit: 6, prereqCap: 3 }
    );
    chunks = scoped.primary;
    mode = `scoped:${scoped.mode}`;

    if (scoped.prerequisites.length) {
      const pr = scoped.prerequisites
        .map((p, i) => `[Background ${i + 1}] ${p.title}: ${p.definition}`)
        .join("\n");
      // Clearly separated from in-scope answer material.
      prereqBlock =
        `\n## Background from earlier in the book (reference only — do NOT expand beyond the student's sections)\n${pr}\n`;
    }
  }
  // No grant ⇒ chunks stays [] ⇒ the existing "no context" rules apply.
} else {
  // Owner: unchanged behaviour.
  const r = await getStructuredContext(message, fileId, 6);
  chunks = r.chunks; mode = r.mode;
}

if (chunks.length > 0) {
  const chunkText = chunks
    .map((c, i) => {
      const tags = [c.number, c.contentType, c.pageStart ? `p.${c.pageStart}` : ""]
        .filter(Boolean).join(" · ");
      return `[Source ${i + 1}${tags ? " · " + tags : ""}] ${c.title}\n${c.content || ""}`;
    })
    .join("\n\n");
  ragBlock = `\n## Relevant Content from Student's Documents\n${chunkText}\n`;
  console.log(`[RAG] mode=${mode} sources=${chunks.length}`);
}
```

**3d.** Include `prereqBlock` where you compose the final prompt (next to `ragBlock`),
so the borrowed background is appended but visibly separated. Since `prereqBlock`
is declared inside the `if (fileId)` block, either lift its declaration up with the
other `*Block` vars or return it out — mirror how `ragBlock`/`weakBlock` are handled
in your file.

---

## Note on email on the token

Edits 3 and `accessRoutes.js` match a granted user by `req.user.email` first, then
fall back to `SectionGrant.grantedToUserId` / the `User` model. If your JWT already
includes email, nothing else is needed. If it does **not**, the cleanest fix is to
add `email` to the JWT payload at login (in `Route/Auth/auth.js` where the token is
signed) so grants resolve directly. Tell me and I'll wire that too.
