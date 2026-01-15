import type { PaperMetadata } from '@/schemas';

export interface ArxivMetadata {
  arxivId: string;
  title: string;
  authors: string[];
  abstract?: string;
  pdfUrl?: string;
}

/**
 * Extract arXiv ID from URL
 * Supports formats:
 * - https://arxiv.org/abs/1234.5678
 * - https://arxiv.org/pdf/1234.5678.pdf
 * - https://arxiv.org/abs/1234.5678v1
 */
export function extractArxivId(url: string): string | null {
  const absMatch = url.match(/arxiv\.org\/abs\/([0-9]{4}\.[0-9]{4,5}(v[0-9]+)?)/);
  if (absMatch) return absMatch[1];

  const pdfMatch = url.match(/arxiv\.org\/pdf\/([0-9]{4}\.[0-9]{4,5}(v[0-9]+)?)/);
  if (pdfMatch) return pdfMatch[1];

  return null;
}

/**
 * Detect if current page is an arXiv page
 */
export function isArxivPage(url: string): boolean {
  return url.includes('arxiv.org');
}

/**
 * Extract metadata from arXiv abstract page DOM
 */
export function extractArxivMetadata(document: Document, url: string): ArxivMetadata | null {
  const arxivId = extractArxivId(url);
  if (!arxivId) return null;

  // Extract title
  const titleEl = document.querySelector('h1.title');
  const title = titleEl?.textContent?.trim().replace(/^Title:\s*/, '') || '';

  // Extract authors
  const authorsEl = document.querySelector('.authors');
  const authors: string[] = [];
  if (authorsEl) {
    const authorLinks = authorsEl.querySelectorAll('a');
    authorLinks.forEach(link => {
      const name = link.textContent?.trim();
      if (name) authors.push(name);
    });
  }

  // Extract abstract
  const abstractEl = document.querySelector('.abstract');
  const abstract = abstractEl?.textContent?.trim().replace(/^Abstract:\s*/, '') || undefined;

  // Extract PDF URL
  const pdfLink = document.querySelector('a[href*="/pdf/"]') as HTMLAnchorElement;
  const pdfUrl = pdfLink?.href || `https://arxiv.org/pdf/${arxivId}.pdf`;
  console.log('[arXiv Adapter] Extracted PDF URL:', pdfUrl);
  console.log('[arXiv Adapter] PDF link element:', pdfLink?.href);
  console.log('[arXiv Adapter] Constructed fallback URL:', `https://arxiv.org/pdf/${arxivId}.pdf`);

  if (!title || authors.length === 0) {
    return null;
  }

  return {
    arxivId,
    title,
    authors,
    abstract,
    pdfUrl,
  };
}

/**
 * Convert arXiv metadata to PaperMetadata format
 */
export function toPaperMetadata(arxivMeta: ArxivMetadata, url: string): PaperMetadata {
  const now = Date.now();
  console.log('[arXiv Adapter] Converting to PaperMetadata, PDF URL:', arxivMeta.pdfUrl);
  const metadata: PaperMetadata = {
    paperId: `arxiv:${arxivMeta.arxivId}` as const,
    title: arxivMeta.title,
    authors: arxivMeta.authors,
    abstract: arxivMeta.abstract,
    source: 'arxiv' as const,
    pdfUrl: arxivMeta.pdfUrl,
    sourceUrl: url,
    firstSeenAt: now,
    lastOpenedAt: now,
    openCount: 1,
    saved: false,
    analyzed: false,
    starred: false,
    tags: [],
  };
  console.log('[arXiv Adapter] Final PaperMetadata PDF URL:', metadata.pdfUrl);
  return metadata;
}
