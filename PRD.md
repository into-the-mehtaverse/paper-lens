## PRD: PaperLens — Personal Research Paper Copilot (Chrome Extension)

### 1) Overview

**PaperLens** is a Chrome extension that detects which research paper a user is reading, extracts the paper content, generates a reviewer-style critique (questions raised, missing ablations/baselines, potential errors/oversights), and maintains a personal “reading memory” across papers. It also connects themes across previously read papers and recommends what to read next.

This is an **individual-use**, **open-source** project. Default posture is **local-first** storage with explicit controls for sending content to external model providers.

---

### 2) Goals and Success Criteria

#### Goals

1. **Paper Detection**: Reliably identify a paper (title/authors + canonical ID if possible) from common sources.
2. **Extraction**: Extract usable text from HTML sources and PDFs (via an extension-controlled reader).
3. **Grounded Critique**: Produce structured outputs with evidence spans (quote + location).
4. **Personal Library / Memory**: Track papers read, store metadata, analyses, and embeddings for cross-paper retrieval.
5. **Connect-the-dots**: Surface themes and related prior papers while reading.
6. **Recommendations**: Suggest next reads based on user’s library and (optional) external candidate fetch.

#### Success Criteria (MVP)

* 90%+ detection accuracy on supported sources (arXiv + OpenReview + direct PDF link).
* PDF extraction works in an extension-controlled reader for 95% of PDFs tested.
* Critique outputs are:

  * structured JSON,
  * include evidence for each critique item,
  * non-generic in at least 70% of cases (subjective QA rubric below).
* Library persists across browser sessions; export/import works.

---

### 3) Non-Goals (MVP)

* No collaborative/team features.
* No “definitive error finding.” We only output **potential issues to verify**.
* No automated reproduction or code execution.
* No full citation graph crawling.
* No mobile support.

---

### 4) Target Users and Primary Use Cases

**User**: A single researcher/engineer reading papers, wants fast critique + memory + next reads.

Primary workflows:

1. Open a paper → click “Analyze” → receive critique with evidence.
2. Continue reading → see “Related papers you read” + “themes” in side panel.
3. Finish → paper is saved to library with tags, notes, and generated artifacts.
4. “What next?” → get recommendations and why.

---

### 5) Supported Sources (MVP)

* arXiv abstract page + PDF
* OpenReview forum page + PDF
* “Direct PDF” URL (user opens extension reader)
* Fallback: manual “Add Paper” via URL

Future sources (post-MVP): ACL Anthology, NeurIPS/ICML proceedings, Semantic Scholar pages, DOI resolver.

---

### 6) Product Requirements

#### 6.1 Functional Requirements

##### A) Paper Detection & Metadata

**FR-A1**: Detect paper identity from current tab:

* If arXiv: parse arXiv ID from URL, fetch title/authors/abstract from DOM.
* If OpenReview: parse forum ID from URL, extract metadata from DOM.
* If PDF: offer “Open in PaperLens Reader” to ingest PDF.

**FR-A2**: Produce canonical `paperId`:

* Preferred: `arxiv:{id}` or `openreview:{forumId}`
* Otherwise: `urlhash:{sha256(url)}`

**FR-A3**: Show “Detected Paper” card in side panel with:

* title, authors, venue/year (if known), source, and status (not saved / saved / analyzed).

##### B) Extraction

**FR-B1**: HTML extraction for supported sources:

* Extract sections if available (at minimum: title/abstract).
* Capture PDF URL if present.

**FR-B2**: PDF ingestion via PaperLens Reader (extension page):

* Fetch PDF (respect CORS; use extension host permissions).
* Render PDF via pdf.js.
* Extract text per page with page mapping.
* Optional: extract headings via heuristics (font size / regex).

**FR-B3**: Chunking:

* Split into chunks of ~800–1,200 tokens (configurable) with overlap.
* Assign each chunk:

  * section label (best-effort),
  * page range,
  * text,
  * stable `chunkId`.

##### C) Analysis (Grounded Critique)

**FR-C1**: Generate structured analysis for a paper:

* Summary (5–8 bullets max)
* Key claims (3–7)
* Questions raised (5–12)
* Missing ablations/baselines (3–10)
* Potential issues/oversights (3–10), each with:

  * issue statement
  * severity (Low/Med/High)
  * confidence (0–1)
  * evidence spans (1–3) referencing chunkId + quote + page/section
* Replication checklist (5–12)
* “What I’d test next week” (2–5 concrete experiments)

**FR-C2**: Evidence-first requirement:

* Every critique item must include at least one evidence span.
* UI must allow “Jump to evidence” (scroll/highlight in Reader; or show excerpt for HTML pages).

**FR-C3**: Task-specific retrieval:

* The system must retrieve relevant chunks per analysis category (see Retrieval spec).

##### D) Library / Memory

**FR-D1**: Save paper metadata + analysis + embeddings locally (IndexedDB).
**FR-D2**: Track reading history:

* `firstSeenAt`, `lastOpenedAt`, `openCount`.
  **FR-D3**: Allow user tags and notes:
* manual tags (freeform), optional starred/favorite.

**FR-D4**: Export/import:

* Export library as JSON (optionally excluding full text).
* Import JSON to restore.

##### E) Connect-the-Dots

**FR-E1**: While reading a paper, show:

* “Related papers you’ve read” (top 5)
* “Recurring themes” (top 3–6)
* “Contrasts / alternative approaches” (top 3)

**FR-E2**: Generate link records between papers:

* `relationType`: similar-theme / method-analogy / contrast / citation-mention (optional)
* `rationale` grounded by retrieved snippets.

##### F) Recommendations

**FR-F1**: Recommend next papers from **local library** (MVP):

* nearest neighbors (same topic)
* method analogs
* novelty picks (diverse but relevant)

**FR-F2 (Optional)**: External candidates:

* Semantic Scholar API or arXiv API to fetch candidates (toggle).
* Rerank with embeddings + diversity.
* Provide “why recommended” explanation grounded in metadata.

---

### 7) UX Requirements

#### Surfaces

1. **Side Panel (primary)**
   Persistent companion:

   * Detected paper card
   * Buttons: Analyze / Save / Add tag / Export note
   * Tabs:

     * Critique
     * Related / Themes
     * Recommendations
     * Library

2. **Popup (secondary)**

   * Quick status + shortcut actions.

3. **PaperLens Reader (extension page)**

   * PDF viewing with:

     * page navigation
     * highlight evidence span
     * extracted text view (optional)
     * “Analyze this PDF” action

4. **Options**

   * Provider selection and keys
   * Privacy mode
   * Storage controls (delete paper / clear all)

#### UI Behavior Requirements

* **UR-1**: Never show ungrounded critique items; if evidence is missing, show “Needs extraction” or “Low confidence.”
* **UR-2**: Show analysis progress:

  * Extraction → Embedding → Retrieval → Generation.
* **UR-3**: Allow re-run with settings (“More critical”, “More experimental rigor”, etc.).

---

### 8) Privacy & Safety Requirements (Open Source Trust)

#### Privacy Modes (must implement)

1. **Local-only**: no external calls (requires local model; MVP may support “analysis disabled” if no local model configured).
2. **Abstract + selected snippets** (default): only send retrieved chunks + metadata.
3. **Full-text**: explicit opt-in per analysis run.

#### Data Handling

* All stored content local in IndexedDB.
* Offer “Exclude full text from storage” toggle.
* Offer “Delete this paper” and “Delete everything” controls.
* Clearly label: “Potential issues to verify; not guaranteed errors.”

---

### 9) Technical Architecture Requirements

#### Extension Platform

* Chrome Extension Manifest V3
* TypeScript throughout
* Build tool: Vite or similar

#### Core Modules

* `background/` service worker: job queue + orchestration
* `content/` site adapters for metadata + PDF links
* `reader/` pdf.js-based viewer and extractor
* `store/` IndexedDB wrapper + migrations
* `llm/` provider abstraction (OpenAI/Anthropic/local)
* `embed/` embeddings abstraction (can share provider)
* `retrieval/` vector search over local embeddings
* `schemas/` Zod schemas for all model outputs
* `ui/` side panel + popup + options

#### Key Constraint

Chrome’s native PDF viewer is not reliably scriptable. All PDF analysis must be done through **PaperLens Reader**.

---

### 10) Retrieval and RAG Specification

#### Chunking

* Default chunk size: 1,000 tokens, overlap 150 tokens.
* Attach metadata: section guess, page range, source.

#### Embeddings

* Store float32 vectors in IndexedDB (or compressed).
* Maintain per-paper centroid embedding for quick similarity.

#### Task-Specific Retrieval (top-k defaults)

* **Missing ablations/baselines**: retrieve from sections: Experiments, Ablations, Results, Appendix. `k=12`
* **Potential issues**: Evaluation protocol, Data, Metrics, Limitations. `k=14`
* **Questions raised**: Limitations, Discussion, Future work, plus highest-level summary chunks. `k=10`
* **Key claims**: Abstract + Intro + Conclusion. `k=8`

#### Cross-Paper Retrieval

* Query = current paper centroid or task-specific query embedding.
* Retrieve top 8 related papers; then top 3 chunks per paper.

#### Deterministic Post-processing

* De-duplicate similar items via similarity threshold.
* Enforce max counts per category.

---

### 11) LLM Prompting and Output Contracts

#### Output must be valid JSON only

* No markdown in model output.
* Validate with Zod; if invalid, retry once with “repair” prompt.
* If still invalid, show error state and preserve raw output in debug logs (local).

#### Core analysis JSON schema (high-level)

* `paper`: {title, authors, source, id}
* `summaryBullets[]`
* `keyClaims[]` (each with optional evidence)
* `questions[]` (each with evidence)
* `missingAblations[]` (each with evidence + suggested experiment)
* `potentialIssues[]` (severity, confidence, evidence, suggested check)
* `replicationChecklist[]`
* `nextWeekTests[]`
* `modelMeta`: provider, model, timestamp

**Evidence span format**

* `chunkId`
* `quote` (max 250 chars)
* `location`: {section?, pageStart?, pageEnd?}

---

### 12) Storage Model (IndexedDB)

#### Tables / Object Stores

1. `papers`

   * `paperId` (PK)
   * metadata fields
   * reading stats
   * flags (saved/analyzed/starred)
2. `chunks`

   * `paperId`, `chunkId` (composite)
   * section/page/text
3. `embeddings`

   * `paperId`, `chunkId` → vector
   * optional `paperCentroid`
4. `analyses`

   * `paperId`, `analysisVersion` → JSON
5. `links`

   * `fromPaperId`, `toPaperId`, `relationType`, `rationale`

---

### 13) Permissions (Chrome)

* `storage`
* `activeTab`
* `scripting`
* `sidePanel`
* `downloads` (export)
* `host_permissions`:

  * `https://arxiv.org/*`
  * `https://openreview.net/*`
  * optional: `https://*.semanticscholar.org/*` (only if external recommendations enabled)

---

### 14) Telemetry / Logging (MVP)

* Default: no external analytics.
* Local debug log viewer in Options:

  * extraction timing
  * embedding timing
  * retrieval stats
  * LLM request sizes (token estimates)
  * errors

---

### 15) Quality Bar and QA Rubric

#### Analysis Quality Rubric (manual QA)

A critique is “non-generic” if:

* at least 60% of items reference specific methods/experiments/datasets from paper
* evidence spans are clearly relevant
* suggested ablations are plausible and specific (not “try more baselines”)

#### Test Suite Requirements

* Unit tests:

  * chunking stability
  * schema validation
  * retrieval correctness on synthetic dataset
* Integration tests:

  * arXiv detection
  * OpenReview detection
  * PDF Reader extraction on sample PDFs (store in repo or downloadable fixtures)
* Golden JSON tests:

  * ensure model outputs pass schemas and cap lengths

---

### 16) Milestones (Implementation Plan)

#### Milestone 1: MVP “Analyze a paper”

* arXiv + OpenReview adapters
* Paper detection card
* PaperLens Reader with pdf.js extraction
* Chunking + embeddings
* Task-specific retrieval
* LLM critique JSON + side panel rendering with evidence

#### Milestone 2: Library + export/import

* IndexedDB stores
* Reading history
* Tagging
* Export/import JSON

#### Milestone 3: Connect-the-dots

* Cross-paper similarity retrieval
* Themes + links generation
* Display related prior papers with rationale

#### Milestone 4: Recommendations

* Local-only recommendation strategies
* Optional external candidate fetch with reranking

---

### 17) Acceptance Criteria (MVP Ship Checklist)

* Analyze works end-to-end on:

  * 5 arXiv papers (HTML page + PDF)
  * 5 OpenReview papers
  * 5 direct PDFs via Reader
* Every critique item has evidence + jump-to.
* Re-run analysis without duplicating stored paper entries.
* Export/import preserves library integrity.
* Clear-all deletes everything.

---

### 18) Repo Conventions

* `pnpm` monorepo recommended (or single package).
* Strict linting + formatting.
* All prompts and schemas versioned.
* No secrets committed; keys stored via extension storage.

---

## Implementation Notes (for Cursor agents)

* Prefer side panel as the primary UI; popup is minimal.
* Treat the LLM as a typed function: **input → JSON**.
* Do not attempt to inject into Chrome’s native PDF viewer; route PDFs through PaperLens Reader.
* Build site adapters as small, testable modules: `detect(url, dom) → metadata`.
* Make sure everything you create is modular, we do not want bloated files.
* For the RAG and RAG-esque components of this project, ensure that we're seperating indexing, retrieval, and generation portions of the code.

---

## tech stack
Concrete “stack list” you can paste into README
Language: TypeScript
UI: React + Tailwind + shadcn/ui
Extension tooling: Vite + CRXJS
PDF: pdf.js (Reader page)
DB: IndexedDB via Dexie (durable data)
State Management: Zustand (ephemeral UI + session data)
LLM/Embeddings: OpenAI (default), optional Anthropic, optional Ollama
Schemas: Zod
Tests: Vitest + Playwright
Vector search: cosine similarity (MVP)
