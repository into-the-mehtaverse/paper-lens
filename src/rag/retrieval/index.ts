import type { Chunk, Embedding } from '@/schemas';

export interface RetrievalResult {
  chunk: Chunk;
  embedding: Embedding;
  score: number;
}

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Retrieve top-k chunks by similarity
 */
export function retrieveTopK(
  queryEmbedding: number[],
  chunks: Chunk[],
  embeddings: Map<string, Embedding>,
  k: number
): RetrievalResult[] {
  const results: RetrievalResult[] = [];

  for (const chunk of chunks) {
    const embedding = embeddings.get(chunk.chunkId);
    if (!embedding) continue;

    const score = cosineSimilarity(queryEmbedding, embedding.vector);
    results.push({
      chunk,
      embedding,
      score,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, k);
}

/**
 * Task-specific retrieval with section filtering
 */
export interface TaskRetrievalOptions {
  sections?: string[]; // Filter by section names
  minScore?: number; // Minimum similarity score
}

export function retrieveForTask(
  queryEmbedding: number[],
  chunks: Chunk[],
  embeddings: Map<string, Embedding>,
  k: number,
  options: TaskRetrievalOptions = {}
): RetrievalResult[] {
  let filteredChunks = chunks;

  // Filter by sections if specified
  if (options.sections && options.sections.length > 0) {
    filteredChunks = chunks.filter(chunk => {
      if (!chunk.section) return false;
      return options.sections!.some(section =>
        chunk.section!.toLowerCase().includes(section.toLowerCase())
      );
    });
  }

  const results = retrieveTopK(queryEmbedding, filteredChunks, embeddings, k);

  // Filter by minimum score if specified
  if (options.minScore !== undefined) {
    return results.filter(r => r.score >= options.minScore!);
  }

  return results;
}

/**
 * Task-specific retrieval configurations
 */
export const TASK_RETRIEVAL_CONFIGS = {
  missingAblations: {
    k: 12,
    sections: ['experiments', 'ablations', 'results', 'appendix'],
  },
  potentialIssues: {
    k: 14,
    sections: ['evaluation', 'data', 'metrics', 'limitations'],
  },
  questions: {
    k: 10,
    sections: ['limitations', 'discussion', 'future work'],
  },
  keyClaims: {
    k: 8,
    sections: ['abstract', 'introduction', 'conclusion'],
  },
} as const;
