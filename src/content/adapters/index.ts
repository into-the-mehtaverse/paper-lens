import { extractArxivMetadata, isArxivPage, toPaperMetadata as arxivToPaperMetadata } from './arxiv';
import { extractOpenReviewMetadata, isOpenReviewPage, toPaperMetadata as openReviewToPaperMetadata } from './openreview';
import type { PaperMetadata } from '@/schemas';

export interface DetectedPaper {
  metadata: PaperMetadata;
  source: 'arxiv' | 'openreview' | 'pdf' | null;
}

/**
 * Detect paper from current page
 */
export function detectPaper(url: string, document: Document): DetectedPaper | null {
  if (isArxivPage(url)) {
    const arxivMeta = extractArxivMetadata(document, url);
    if (arxivMeta) {
      return {
        metadata: arxivToPaperMetadata(arxivMeta, url),
        source: 'arxiv',
      };
    }
  }

  if (isOpenReviewPage(url)) {
    const openReviewMeta = extractOpenReviewMetadata(document, url);
    if (openReviewMeta) {
      return {
        metadata: openReviewToPaperMetadata(openReviewMeta, url),
        source: 'openreview',
      };
    }
  }

  // Check if it's a direct PDF
  if (url.endsWith('.pdf') || url.includes('.pdf?')) {
    // For PDFs, we'll need to extract metadata from the PDF itself
    // This will be handled by the PDF reader
    return null;
  }

  return null;
}
