import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js for service worker context (no window object)
// Use a CDN worker or bundle the worker
if (typeof window === 'undefined') {
  // Service worker context - use CDN worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
} else {
  // Browser context
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export interface PdfPage {
  pageNumber: number;
  text: string;
}

export interface PdfMetadata {
  title?: string;
  authors?: string[];
  abstract?: string;
}

/**
 * Extract text from PDF URL
 * Works in both browser and service worker contexts
 */
export async function extractPdfText(pdfUrl: string): Promise<{
  pages: PdfPage[];
  metadata: PdfMetadata;
}> {
  // Fetch PDF as ArrayBuffer to work in service workers
  let arrayBuffer: ArrayBuffer;
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    arrayBuffer = await response.arrayBuffer();
  } catch (error) {
    throw new Error(`Failed to fetch PDF from ${pdfUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    verbosity: 0,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pages: PdfPage[] = [];

  // Extract metadata
  const metadata = await pdf.getMetadata();
  const info = metadata?.info as { Title?: string; Author?: string } | undefined;

  const pdfMetadata: PdfMetadata = {
    title: info?.Title,
    authors: info?.Author ? [info.Author] : undefined,
  };

  // Extract text from each page
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');

    pages.push({
      pageNumber: pageNum,
      text: pageText,
    });
  }

  return {
    pages,
    metadata: pdfMetadata,
  };
}

/**
 * Extract text from PDF file/blob
 */
export async function extractPdfFromFile(file: File | Blob): Promise<{
  pages: PdfPage[];
  metadata: PdfMetadata;
}> {
  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    verbosity: 0,
  });

  const pdf = await loadingTask.promise;
  const pages: PdfPage[] = [];

  const metadata = await pdf.getMetadata();
  const info = metadata?.info as { Title?: string; Author?: string } | undefined;

  const pdfMetadata: PdfMetadata = {
    title: info?.Title,
    authors: info?.Author ? [info.Author] : undefined,
  };

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');

    pages.push({
      pageNumber: pageNum,
      text: pageText,
    });
  }

  return {
    pages,
    metadata: pdfMetadata,
  };
}
