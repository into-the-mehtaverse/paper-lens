// Dynamic import to avoid window access during module initialization
let pdfjsLib: typeof import('pdfjs-dist');
let workerUrl: string | null = null;

// Lazy load pdf.js to avoid window access issues in service workers
async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    
    // Configure worker - use local bundled worker file
    // In Chrome extensions, we need to use chrome.runtime.getURL() for extension resources
    if (!workerUrl) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        // Chrome extension context - use extension-relative path to bundled worker
        // Vite copies public/ files to dist/ root
        workerUrl = chrome.runtime.getURL('pdf.worker.min.mjs');
        console.log('[PDF Extractor] Using extension worker URL:', workerUrl);
      } else {
        // Fallback - try to use a blob URL or inline worker
        // This shouldn't happen in our extension context
        console.warn('[PDF Extractor] Chrome runtime not available, using fallback worker');
        workerUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      }
    }
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    console.log('[PDF Extractor] Configured pdf.js worker source:', workerUrl);
  }
  return pdfjsLib;
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
  console.log('[PDF Extractor] Attempting to fetch PDF from URL:', pdfUrl);
  
  // Load pdf.js dynamically
  const pdfjs = await getPdfJs();
  
  // Fetch PDF as ArrayBuffer to work in service workers
  let arrayBuffer: ArrayBuffer;
  try {
    console.log('[PDF Extractor] Starting fetch request...');
    const response = await fetch(pdfUrl);
    console.log('[PDF Extractor] Fetch response status:', response.status, response.statusText);
    console.log('[PDF Extractor] Fetch response headers:', Object.fromEntries(response.headers.entries()));
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    arrayBuffer = await response.arrayBuffer();
    console.log('[PDF Extractor] Successfully fetched PDF, size:', arrayBuffer.byteLength, 'bytes');
  } catch (error) {
    console.error('[PDF Extractor] Fetch error:', error);
    console.error('[PDF Extractor] Failed URL:', pdfUrl);
    throw new Error(`Failed to fetch PDF from ${pdfUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const loadingTask = pdfjs.getDocument({
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
  // Load pdf.js dynamically
  const pdfjs = await getPdfJs();
  
  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjs.getDocument({
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
