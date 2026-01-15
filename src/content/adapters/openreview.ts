import type { PaperMetadata } from '@/schemas';

export interface OpenReviewMetadata {
  forumId: string;
  title: string;
  authors: string[];
  abstract?: string;
  venue?: string;
  year?: number;
  pdfUrl?: string;
}

/**
 * Extract OpenReview forum ID from URL
 * Format: https://openreview.net/forum?id=...
 */
export function extractOpenReviewId(url: string): string | null {
  const match = url.match(/openreview\.net\/forum\?id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Detect if current page is an OpenReview page
 */
export function isOpenReviewPage(url: string): boolean {
  return url.includes('openreview.net');
}

/**
 * Extract metadata from OpenReview forum page DOM
 */
export function extractOpenReviewMetadata(document: Document, url: string): OpenReviewMetadata | null {
  const forumId = extractOpenReviewId(url);
  if (!forumId) return null;

  // Extract title
  const titleEl = document.querySelector('h1, .note-content-field[data-field="title"]');
  const title = titleEl?.textContent?.trim() || '';

  // Extract authors - OpenReview uses various selectors
  const authors: string[] = [];
  const authorsEl = document.querySelector('.note-content-field[data-field="authors"]') ||
                    document.querySelector('.authors, [class*="author"]');

  if (authorsEl) {
    const authorLinks = authorsEl.querySelectorAll('a, span');
    authorLinks.forEach(el => {
      const name = el.textContent?.trim();
      if (name && name.length > 0 && !authors.includes(name)) {
        authors.push(name);
      }
    });
  }

  // Extract abstract
  const abstractEl = document.querySelector('.note-content-field[data-field="abstract"]') ||
                     document.querySelector('.abstract, [class*="abstract"]');
  const abstract = abstractEl?.textContent?.trim() || undefined;

  // Extract venue/year from various possible locations
  let venue: string | undefined;
  let year: number | undefined;

  const venueEl = document.querySelector('.note-content-field[data-field="venue"]') ||
                   document.querySelector('[class*="venue"]');
  if (venueEl) {
    const venueText = venueEl.textContent?.trim() || '';
    venue = venueText;
    // Try to extract year from venue text
    const yearMatch = venueText.match(/(20\d{2})/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
    }
  }

  // Extract PDF URL
  const pdfLink = document.querySelector('a[href*=".pdf"], a[href*="/pdf"]') as HTMLAnchorElement;
  let pdfUrl = pdfLink?.href;
  console.log('[OpenReview Adapter] Found PDF link element:', pdfLink?.href);
  if (pdfUrl && !pdfUrl.startsWith('http')) {
    pdfUrl = new URL(pdfUrl, url).href;
    console.log('[OpenReview Adapter] Resolved relative URL to:', pdfUrl);
  }
  if (!pdfUrl) {
    // Fallback: construct PDF URL from forum ID
    pdfUrl = `https://openreview.net/pdf?id=${forumId}`;
    console.log('[OpenReview Adapter] Using fallback PDF URL:', pdfUrl);
  }
  console.log('[OpenReview Adapter] Final PDF URL:', pdfUrl);

  if (!title || authors.length === 0) {
    return null;
  }

  return {
    forumId,
    title,
    authors,
    abstract,
    venue,
    year,
    pdfUrl,
  };
}

/**
 * Convert OpenReview metadata to PaperMetadata format
 */
export function toPaperMetadata(openReviewMeta: OpenReviewMetadata, url: string): PaperMetadata {
  const now = Date.now();
  console.log('[OpenReview Adapter] Converting to PaperMetadata, PDF URL:', openReviewMeta.pdfUrl);
  const metadata: PaperMetadata = {
    paperId: `openreview:${openReviewMeta.forumId}` as const,
    title: openReviewMeta.title,
    authors: openReviewMeta.authors,
    abstract: openReviewMeta.abstract,
    venue: openReviewMeta.venue,
    year: openReviewMeta.year,
    source: 'openreview' as const,
    pdfUrl: openReviewMeta.pdfUrl,
    sourceUrl: url,
    firstSeenAt: now,
    lastOpenedAt: now,
    openCount: 1,
    saved: false,
    analyzed: false,
    starred: false,
    tags: [],
  };
  console.log('[OpenReview Adapter] Final PaperMetadata PDF URL:', metadata.pdfUrl);
  return metadata;
}
