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
  // Common section patterns - more comprehensive
  const sectionPatterns = [
    // Standard section names (case-insensitive, start of line)
    /^(abstract|introduction|related work|background|methodology|methods|method|experiments|experimental|results|evaluation|discussion|conclusion|conclusions|references|bibliography|appendix|acknowledgments?)/i,
    // Numbered sections like "1. Introduction" or "1 Introduction"
    /^(\d+\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    // ALL CAPS headers (likely section titles)
    /^([A-Z][A-Z\s]{2,30})$/,
    // Section headers with colons like "Method: ..." or "Results:"
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*):\s*$/,
  ];

  // Check more lines and also look for common section indicators
  const lines = text.split('\n').slice(0, 10); // Check first 10 lines
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and very short lines
    if (trimmed.length < 3) continue;
    
    for (const pattern of sectionPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const sectionName = (match[1] || trimmed).toLowerCase();
        // Normalize common variations
        if (sectionName.includes('method')) return 'methods';
        if (sectionName.includes('experiment')) return 'experiments';
        if (sectionName.includes('result')) return 'results';
        if (sectionName.includes('discuss')) return 'discussion';
        if (sectionName.includes('conclusion')) return 'conclusion';
        if (sectionName.includes('abstract')) return 'abstract';
        if (sectionName.includes('introduction') || sectionName.includes('intro')) return 'introduction';
        if (sectionName.includes('related work') || sectionName.includes('related')) return 'related work';
        
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
