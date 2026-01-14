import type { Chunk } from '@/schemas';

export interface ChunkingOptions {
  chunkSize: number; // in tokens (approximate)
  overlap: number; // in tokens
  tokenEstimate?: (text: string) => number; // custom token counter
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  chunkSize: 1000,
  overlap: 150,
};

/**
 * Rough token estimation: ~4 characters per token
 */
function defaultTokenEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Detect section headers in text using heuristics
 */
function detectSection(text: string): string | undefined {
  // Common section patterns
  const sectionPatterns = [
    /^(abstract|introduction|related work|methodology|methods|experiments|results|discussion|conclusion|references|appendix)/i,
    /^(\d+\.?\s+[A-Z][a-z]+)/, // Numbered sections like "1. Introduction"
    /^([A-Z][A-Z\s]+)$/, // ALL CAPS headers
  ];

  const lines = text.split('\n').slice(0, 3); // Check first few lines
  for (const line of lines) {
    const trimmed = line.trim();
    for (const pattern of sectionPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return match[1] || trimmed.substring(0, 50);
      }
    }
  }

  return undefined;
}

/**
 * Split text into chunks with overlap
 */
export function chunkText(
  text: string,
  options: Partial<ChunkingOptions> = {},
  metadata?: { paperId: string; pageStart?: number; pageEnd?: number }
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const tokenEstimate = opts.tokenEstimate || defaultTokenEstimate;

  const chunks: Chunk[] = [];
  const words = text.split(/\s+/);
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordTokens = tokenEstimate(word + ' ');

    // If adding this word would exceed chunk size, finalize current chunk
    if (currentTokens + wordTokens > opts.chunkSize && currentChunk.length > 0) {
      const chunkText = currentChunk.join(' ');
      const section = detectSection(chunkText);

      chunks.push({
        paperId: metadata?.paperId || '',
        chunkId: `${metadata?.paperId || 'paper'}-chunk-${chunkIndex}`,
        text: chunkText,
        section,
        pageStart: metadata?.pageStart,
        pageEnd: metadata?.pageEnd,
        tokenCount: currentTokens,
      });

      // Start new chunk with overlap
      const overlapTokens = Math.floor(opts.overlap / 2);
      let overlapCount = 0;
      currentChunk = [];
      currentTokens = 0;

      // Add overlap words from previous chunk
      for (let j = chunks.length > 0 ? chunks.length - 1 : 0; j >= 0 && overlapCount < overlapTokens; j--) {
        const prevWords = chunks[j].text.split(/\s+/);
        for (let k = prevWords.length - 1; k >= 0 && overlapCount < overlapTokens; k--) {
          const prevWord = prevWords[k];
          const prevTokens = tokenEstimate(prevWord + ' ');
          currentChunk.unshift(prevWord);
          currentTokens += prevTokens;
          overlapCount += prevTokens;
        }
      }

      chunkIndex++;
    }

    currentChunk.push(word);
    currentTokens += wordTokens;
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join(' ');
    const section = detectSection(chunkText);

    chunks.push({
      paperId: metadata?.paperId || '',
      chunkId: `${metadata?.paperId || 'paper'}-chunk-${chunkIndex}`,
      text: chunkText,
      section,
      pageStart: metadata?.pageStart,
      pageEnd: metadata?.pageEnd,
      tokenCount: currentTokens,
    });
  }

  return chunks;
}

/**
 * Chunk PDF pages with page-level metadata
 */
export function chunkPdfPages(
  pages: Array<{ pageNumber: number; text: string }>,
  paperId: string,
  options: Partial<ChunkingOptions> = {}
): Chunk[] {
  const allChunks: Chunk[] = [];

  for (const page of pages) {
    const pageChunks = chunkText(page.text, options, {
      paperId,
      pageStart: page.pageNumber,
      pageEnd: page.pageNumber,
    });
    allChunks.push(...pageChunks);
  }

  return allChunks;
}
