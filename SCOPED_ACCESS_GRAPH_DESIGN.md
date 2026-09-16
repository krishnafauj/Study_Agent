# Scoped Access + Knowledge-Graph Prerequisites — Design

**Feature in one line:** carve a PDF into page-range *permission sections*, approve
specific sections per user, and let a scoped chat pull only the **minimum
prerequisite concept** it needs from outside the approved range — via the
knowledge graph, **without an LLM call**, and **without ever overcrossing the
approved boundary**.

This is **additive**. Upload, extraction (`book-breaker`), embeddings, and the
existing chat all stay exactly as they are. Everything below is new files plus a
few small, clearly-marked wiring edits.

---

## 1. The rule that drives everything ("don't overcross")

A user approved for **pages 10–20** must be treated as if the rest of the book
does not exist — *except* that when a concept in 10–20 genuinely depends on an
earlier concept (say **Inertia**, defined on page 5), the system may inject the
**single stored definition of that one concept** so the answer makes sense.

The wall is enforced by five hard invariants, checked in `scopedRetrievalService`:

| # | Invariant | How it's enforced |
|---|---|---|
| 1 | **Primary answer content is always in-scope** | Chunk query filters `pageStart/pageEnd` to the approved ranges. An out-of-range chunk can never be returned as primary content. |
| 2 | **A prerequisite crosses only through an edge** | An out-of-range node is eligible only if a `ConceptEdge(relation="prerequisite")` points *from* it *to* an in-scope node. No edge → no crossing. |
| 3 | **Only the node's short definition crosses — never the page** | We inject `summary` / key-concept definition (truncated), never the raw page text of the restricted page. |
| 4 | **Depth = 1, capped** | Only *direct* prerequisites, top-N by weight (default 3). No transitive walk (15 → 5 → 2 → whole book). |
| 5 | **Borrowed ≠ browsable** | The prerequisite enters the LLM context only. It does not appear in the user's section list, cannot be opened, listed, or queried directly. `my-scope` still returns 10–20. |

**The approved sections are always derived server-side from the caller's grant —
never taken from the client.** The client cannot ask for a wider scope than it
was granted.

---

## 2. Data model (3 new MongoDB collections)

All mirror your existing Mongoose/ESM style (`models/topic.js`).

### `PermissionSection` — the "dedicated sections for permissions"
A named page range on a file. Created by the file owner.

```
fileId    : String (= UserFile._id)   index
userId    : String (owner)            index
title     : String                    e.g. "Chapter 2: Laws of Motion"
pageStart : Number
pageEnd   : Number
order     : Number
createdAt / updatedAt
```

### `SectionGrant` — "this user is approved for these sections"
One document per (file, invited user). This is what turns "access to chat" into
"access to *these sub-parts* of the chat".

```
fileId          : String   index
grantedToEmail  : String   index   (lowercased)
grantedToUserId : String   (filled in once that user is known; optional)
sectionIds      : [ObjectId ref PermissionSection]   the approved sub-parts
grantedBy       : String   (owner userId)
status          : String   enum active|revoked  default active
createdAt / updatedAt
unique index: (fileId, grantedToEmail)
```

### `ConceptEdge` — the knowledge-graph edges (prerequisite links)
The nodes are your existing `Topic` documents — no new node collection.

```
fileId      : String   index
fromTopicId : ObjectId ref Topic   (the prerequisite / earlier concept)
toTopicId   : ObjectId ref Topic   (the dependent / later concept)
relation    : String   default "prerequisite"
weight      : Number    (how strongly B depends on A)
source      : String   enum keyword|llm|hybrid
evidence    : [String]  (which terms triggered the link — for debugging/audit)
createdAt
index: (fileId, toTopicId)   ← the hot lookup: "what does this in-scope node need?"
```

Edge direction: **`from` is needed_by `to`** (`Inertia → Newton's 2nd Law`).

---

## 3. Edge building (one-time, at upload) — `knowledgeGraphService.buildConceptEdges(fileId)`

Runs **once**, right after `processPDFHierarchy` finishes. The scoped chat never
builds edges — it only reads them.

**Hybrid** (recommended default):

1. **Deterministic base (no LLM).** Load the file's concept nodes (`Topic`s with
   `keyConcepts` / real content and page ranges). For each later node **B**, scan
   earlier nodes **A** (`A.pageEnd < B.pageStart`, or lower `order`). If B's text
   mentions A's `title` or one of A's `keyConcepts` names on a word boundary,
   create/strengthen edge `A → B`, `source="keyword"`, `weight += hits`,
   `evidence += matched term`.
2. **Surgical LLM refine (optional flag `useLlm`).** Only for the *ambiguous*
   candidates (weak weight / many competing links), ask the LLM to confirm real
   prerequisites — the same pattern `contentType.js` already uses. Marks those
   `source="llm"`/`"hybrid"`.
3. **Cap out-degree** per node (e.g. keep top 8 incoming prerequisites) and dedup.

Toggleable: `buildConceptEdges(fileId, { useLlm: false })` = deterministic-only,
never touches an LLM.

---

## 4. Scoped retrieval — `scopedRetrievalService.getScopedGraphContext(message, fileId, approvedSections, opts)`

Sits **beside** `getStructuredContext`, does not replace it. Returns:

```
{
  scope: [{ pageStart, pageEnd }...],   // the approved ranges
  primary: [ ...chunks strictly inside scope... ],
  prerequisites: [ { title, definition, why } ],  // borrowed, summary-only, capped
  mode: "section" | "type" | "vector",
}
```

Flow:

1. **Build the approved page predicate** from `approvedSections` (supports
   non-contiguous ranges like 10–20 **and** 40–50) → a Mongo `$or` of range
   conditions. *(Invariant 1)*
2. **Primary retrieval, scoped.** Reuse your retrieval logic (section/contentType
   routing via `detectContentTypes`/`detectSectionRef`, then semantic cosine via
   `embeddingService`) — but every `Topic` query carries the page predicate, so
   results can only come from approved pages.
3. **Prerequisite pull.** Take the returned primary node `_id`s → query
   `ConceptEdge { fileId, toTopicId: { $in }, relation: "prerequisite" }` →
   collect `fromTopicId`s. *(Invariant 2)*
4. **Keep only out-of-scope prerequisites** (in-scope ones are already available),
   **depth 1**, **top-N by weight** (default 3). *(Invariant 4)*
5. **Shape them minimally** — `title` + truncated `summary`/definition only, never
   `content`/page text; tag `borrowed:true`. *(Invariant 3)*

`buildSystemPrompt` then renders `prerequisites` as a clearly-labelled
"Background you may reference (from earlier in the book): …" block, distinct from
the in-scope answer material.

---

## 5. API (new `Route/accessRoutes.js`, all behind `verifyToken`)

Owner = `Topic/UserFile.userId === req.user.userId`.

```
POST   /api/access/:fileId/sections          (owner) create a permission section
GET    /api/access/:fileId/sections          (owner) list sections
DELETE /api/access/:fileId/sections/:id      (owner) remove a section

POST   /api/access/:fileId/grants            (owner) { email, sectionIds } approve
GET    /api/access/:fileId/grants            (owner) list grants
DELETE /api/access/:fileId/grants/:id        (owner) revoke

GET    /api/access/:fileId/my-scope          (caller) my approved sections (owner ⇒ full)
POST   /api/access/:fileId/graph/build       (owner) build edges (also auto after processing)

POST   /api/access/:fileId/scoped-context    (caller) { message } ⇒ scoped context
       ↑ server derives approvedSections from the caller's grant, never from the body
```

---

## 6. Wiring into existing code (3 small edits — marked, not guessed)

1. **`Route/Route.js`** — register the router:
   ```js
   import accessRoutes from "./accessRoutes.js";
   // ...after the other router.use(...) lines:
   router.use(accessRoutes);
   ```
2. **After processing finishes** (in `topicRoutes.js` `processFileAsync`, once the
   pipeline reaches `completed`): `await buildConceptEdges(fileId).catch(logErr)`.
3. **`chatStreamController.js` → `buildSystemPrompt`** — when the caller is **not**
   the file owner and has an active grant, call `getScopedGraphContext(message,
   fileId, grantedSections)` instead of `getStructuredContext(...)`. Owner path is
   unchanged. (Exact diff provided with the code.)

---

## 7. Frontend — new page `app/(app)/access/[fileId]/page.tsx`

Two panels:
- **Sections** — table of page ranges (title, start, end) with add/delete. Prefills
  suggestions from the file's chapter outline (`GET /api/topics/:fileId`).
- **Grants** — invite by email + checkboxes of which sections to approve; list of
  existing grants with revoke.

Linked from the dashboard/topics page via a "Manage access" button.

---

## 8. Open assumption to confirm

The JWT payload exposes `req.user.userId` everywhere in your code. For matching a
grant to the logged-in invited user I also need their **email** on the token
(`req.user.email`). If the token doesn't carry email, `my-scope`/`scoped-context`
will resolve the grant by looking the user up via the `User` model instead — I've
written the code to try `req.user.email` first and fall back, and flagged the spot.
