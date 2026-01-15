/**
 * PDF Worker - Offscreen Document
 * 
 * Handles PDF text extraction using pdf.js.
 * This runs in an offscreen document context which has DOM access
 * required by pdf.js, unlike the service worker.
 * 
 * Communication pattern:
 * 1. Background sends EXTRACT_PDF message with pdfUrl
 * 2. This worker extracts text and responds via sendResponse
 * 3. Background awaits the response directly (no separate message)
 */

// Initialize pdf.js with error handling
let pdfjs: typeof import('pdfjs-dist');
let pdfjsReady = false;

(async () => {
  try {
    console.log('[PDF Worker] Loading pdf.js...');
    pdfjs = await import('pdfjs-dist');
    
    // Configure pdf.js worker - must be done before any PDF operations
    const workerUrl = chrome.runtime.getURL('pdf.worker.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    console.log('[PDF Worker] pdf.js loaded, version:', pdfjs.version, 'worker:', workerUrl);
    pdfjsReady = true;
    
    // Signal ready after pdf.js is loaded
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' }).catch((err) => {
      console.error('[PDF Worker] Failed to send OFFSCREEN_READY:', err);
    });
    console.log('[PDF Worker] Ready for extraction requests');
  } catch (error) {
    console.error('[PDF Worker] Failed to load pdf.js:', error);
    // Send error to background
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_ERROR',
      error: `Failed to load pdf.js: ${error instanceof Error ? error.message : String(error)}`,
    }).catch(() => {});
  }
})();

interface ExtractRequest {
  type: 'EXTRACT_PDF';
  pdfUrl: string;
}

interface PdfPage {
  pageNumber: number;
  text: string;
}

interface ExtractionResponse {
  success: boolean;
  pages?: PdfPage[];
  metadata?: {
    title?: string;
    author?: string;
  };
  error?: string;
}

/**
 * Extract text content from all pages of a PDF
 */
async function extractPdfText(pdfUrl: string): Promise<{
  pages: PdfPage[];
  metadata: { title?: string; author?: string };
}> {
  if (!pdfjsReady || !pdfjs) {
    throw new Error('pdf.js is not loaded yet');
  }
  
  console.log('[PDF Worker] Fetching PDF from:', pdfUrl);
  
  // Fetch the PDF
  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  console.log('[PDF Worker] PDF fetched, size:', arrayBuffer.byteLength, 'bytes');

  // Load the PDF document
  const pdf = await pdfjs.getDocument({
    data: arrayBuffer,
    verbosity: 0,
    useSystemFonts: true,
  }).promise;

  console.log('[PDF Worker] PDF loaded, pages:', pdf.numPages);

  // Extract metadata
  const pdfMetadata = await pdf.getMetadata().catch(() => null);
  const info = pdfMetadata?.info as { Title?: string; Author?: string } | undefined;
  
  const metadata = {
    title: info?.Title,
    author: info?.Author,
  };

  // Extract text from each page
  const pages: PdfPage[] = [];
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Combine text items, preserving some structure
    const text = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    pages.push({
      pageNumber: pageNum,
      text,
    });
  }

  console.log('[PDF Worker] Extraction complete, extracted', pages.length, 'pages');

  return { pages, metadata };
}

/**
 * Message handler - responds directly via sendResponse for clean async pattern
 */
chrome.runtime.onMessage.addListener(
  (message: ExtractRequest, _sender, sendResponse: (response: ExtractionResponse) => void) => {
    if (message.type !== 'EXTRACT_PDF') {
      return false; // Not our message
    }

    if (!pdfjsReady || !pdfjs) {
      console.error('[PDF Worker] pdf.js not ready yet');
      sendResponse({
        success: false,
        error: 'pdf.js is not loaded yet. Please wait and try again.',
      });
      return true;
    }

    console.log('[PDF Worker] Received extraction request for:', message.pdfUrl);

    // Handle extraction asynchronously
    extractPdfText(message.pdfUrl)
      .then(({ pages, metadata }) => {
        console.log('[PDF Worker] Sending success response');
        sendResponse({
          success: true,
          pages,
          metadata,
        });
      })
      .catch((error) => {
        console.error('[PDF Worker] Extraction failed:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    // Return true to indicate we'll send response asynchronously
    return true;
  }
);

// Message listener is registered immediately
// OFFSCREEN_READY is sent after pdf.js loads (see async IIFE above)
