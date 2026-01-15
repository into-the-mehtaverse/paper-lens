import { z } from 'zod';

// Paper ID formats
export const PaperIdSchema = z.union([
  z.string().regex(/^arxiv:[0-9]{4}\.[0-9]{4,5}(v[0-9]+)?$/),
  z.string().regex(/^openreview:[a-zA-Z0-9_-]+$/),
  z.string().regex(/^urlhash:[a-f0-9]{64}$/),
]);

export type PaperId = z.infer<typeof PaperIdSchema>;

// Paper metadata
export const PaperMetadataSchema = z.object({
  paperId: PaperIdSchema,
  title: z.string(),
  authors: z.array(z.string()),
  abstract: z.string().optional(),
  venue: z.string().optional(),
  year: z.number().optional(),
  source: z.enum(['arxiv', 'openreview', 'pdf', 'manual']),
  pdfUrl: z.string().url().optional(),
  sourceUrl: z.string().url(),
  firstSeenAt: z.number(), // timestamp
  lastOpenedAt: z.number(),
  openCount: z.number().default(0),
  saved: z.boolean().default(false),
  analyzed: z.boolean().default(false),
  starred: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});

export type PaperMetadata = z.infer<typeof PaperMetadataSchema>;

// Location reference for evidence spans
export const LocationSchema = z.object({
  section: z.string().optional(),
  pageStart: z.number().optional(),
  pageEnd: z.number().optional(),
});

export type Location = z.infer<typeof LocationSchema>;

// Evidence span
export const EvidenceSpanSchema = z.object({
  chunkId: z.string(),
  quote: z.string(),
  location: LocationSchema,
});

export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;

// Chunk schema
export const ChunkSchema = z.object({
  paperId: PaperIdSchema,
  chunkId: z.string(),
  text: z.string(),
  section: z.string().optional(),
  pageStart: z.number().optional(),
  pageEnd: z.number().optional(),
  tokenCount: z.number().optional(),
});

export type Chunk = z.infer<typeof ChunkSchema>;

// Embedding schema
export const EmbeddingSchema = z.object({
  paperId: PaperIdSchema,
  chunkId: z.string(),
  vector: z.array(z.number()),
  model: z.string(),
  createdAt: z.number(),
});

export type Embedding = z.infer<typeof EmbeddingSchema>;

// Analysis output schemas
export const KeyClaimSchema = z.object({
  claim: z.string(),
  evidence: z.array(EvidenceSpanSchema).optional(),
});

export const QuestionSchema = z.object({
  question: z.string(),
  evidence: z.array(EvidenceSpanSchema).min(1),
});

export const MissingAblationSchema = z.object({
  description: z.string(),
  suggestedExperiment: z.string(),
  evidence: z.array(EvidenceSpanSchema).min(1),
});

export const PotentialIssueSchema = z.object({
  issue: z.string(),
  severity: z.enum(['Low', 'Med', 'High']),
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvidenceSpanSchema).min(1),
  suggestedCheck: z.string().optional(),
});

export const AnalysisSchema = z.object({
  paper: z.object({
    title: z.string(),
    authors: z.array(z.string()),
    source: z.string(),
    id: z.union([PaperIdSchema, z.string()]), // Allow string for now, validate later
  }),
  summaryBullets: z.array(z.string()).min(2).max(3),
  keyClaims: z.array(KeyClaimSchema).min(2).max(3),
  questions: z.array(QuestionSchema).min(2).max(3),
  missingAblations: z.array(MissingAblationSchema).min(2).max(3),
  potentialIssues: z.array(PotentialIssueSchema).min(2).max(3),
  replicationChecklist: z.array(z.string()).min(2).max(3),
  nextWeekTests: z.array(z.string()).min(2).max(3),
  modelMeta: z.object({
    provider: z.string(),
    model: z.string(),
    timestamp: z.number(),
  }),
  analysisVersion: z.string().default('1.0.0'),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

// Stored analysis record
export const StoredAnalysisSchema = z.object({
  paperId: PaperIdSchema,
  analysisVersion: z.string(),
  analysis: AnalysisSchema,
  createdAt: z.number(),
});

export type StoredAnalysis = z.infer<typeof StoredAnalysisSchema>;

// Paper link/relation
export const PaperLinkSchema = z.object({
  fromPaperId: PaperIdSchema,
  toPaperId: PaperIdSchema,
  relationType: z.enum(['similar-theme', 'method-analogy', 'contrast', 'citation-mention']),
  rationale: z.string(),
  createdAt: z.number(),
});

export type PaperLink = z.infer<typeof PaperLinkSchema>;
