import type { Chunk } from '@/schemas';

export interface AnalysisOptions {
  tone?: 'critical' | 'balanced' | 'experimental';
  privacyMode?: 'abstract-only' | 'snippets' | 'full-text';
}

/**
 * Build analysis prompt from paper metadata and retrieved chunks
 */
export function buildAnalysisPrompt(
  paperMetadata: { title: string; authors: string[]; abstract?: string; paperId?: string },
  retrievedChunks: Record<string, Chunk[]>,
  options: AnalysisOptions = {}
): string {
  const tone = options.tone || 'balanced';
  const toneInstructions = {
    critical: 'Be more critical and skeptical. Focus on potential weaknesses.',
    balanced: 'Provide balanced, constructive feedback.',
    experimental: 'Focus on experimental rigor and reproducibility.',
  }[tone];

  const chunksText = Object.entries(retrievedChunks)
    .map(([task, chunks]) => {
      const chunksList = chunks
        .map((c) => {
          const locationInfo = [
            c.section ? `Section: ${c.section}` : null,
            c.pageStart ? `Page: ${c.pageStart}${c.pageEnd && c.pageEnd !== c.pageStart ? `-${c.pageEnd}` : ''}` : null,
          ].filter(Boolean).join(', ');
          const locationPrefix = locationInfo ? `[${locationInfo}] ` : '';
          return `[${c.chunkId}] ${locationPrefix}${c.text.substring(0, 500)}...`;
        })
        .join('\n\n');
      return `## ${task}\n${chunksList}`;
    })
    .join('\n\n');

  return `Analyze this research paper and generate a structured critique.

Paper:
Title: ${paperMetadata.title}
Authors: ${paperMetadata.authors.join(', ')}
${paperMetadata.abstract ? `Abstract: ${paperMetadata.abstract}` : ''}

Retrieved Evidence Chunks:
${chunksText}

Instructions:
${toneInstructions}
Focus on quality over quantity. Generate only the most important and impactful items (2-3 per section). Be selective and prioritize the most significant insights.

Generate a JSON object with the following structure:
{
  "paper": {
    "title": "${paperMetadata.title.replace(/"/g, '\\"')}",
    "authors": ${JSON.stringify(paperMetadata.authors)},
    "source": "${paperMetadata.paperId?.startsWith('arxiv:') ? 'arxiv' : paperMetadata.paperId?.startsWith('openreview:') ? 'openreview' : 'pdf'}",
    "id": "${paperMetadata.paperId || 'paper-id'}"
  },
  "summaryBullets": ["bullet 1", "bullet 2", ...], // 2-3 bullets
  "keyClaims": [
    {
      "claim": "claim text",
      "evidence": [{"chunkId": "...", "quote": "...", "location": {...}}]
    }
  ], // 2-3 claims
  "questions": [
    {
      "question": "question text",
      "evidence": [{"chunkId": "...", "quote": "...", "location": {...}}]
    }
  ], // 2-3 questions
  "missingAblations": [
    {
      "description": "description",
      "suggestedExperiment": "experiment",
      "evidence": [{"chunkId": "...", "quote": "...", "location": {...}}]
    }
  ], // 2-3 items
  "potentialIssues": [
    {
      "issue": "issue description",
      "severity": "Low|Med|High",
      "confidence": 0.0-1.0,
      "evidence": [{"chunkId": "...", "quote": "...", "location": {...}}],
      "suggestedCheck": "what to check"
    }
  ], // 2-3 items
  "replicationChecklist": ["item 1", "item 2", ...], // 2-3 items
  "nextWeekTests": ["test 1", "test 2", ...], // 2-3 items
  "modelMeta": {
    "provider": "openai",
    "model": "gpt-5.2",
    "timestamp": ${Date.now()}
  }
}

IMPORTANT: Every critique item MUST include at least one evidence span with chunkId, quote, and location.`;
}
