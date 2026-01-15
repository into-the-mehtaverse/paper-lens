/**
 * PDF Extraction Service
 * 
 * Clean API for extracting text from PDFs via the offscreen document.
 * The offscreen document handles the actual pdf.js processing since
 * service workers don't have access to required DOM APIs.
 */

export interface PdfPage {
  pageNumber: number;
  text: string;
}

export interface PdfExtractionResult {
  pages: PdfPage[];
  metadata?: {
    title?: string;
    author?: string;
  };
}

const OFFSCREEN_PATH = 'src/offscreen/index.html';
const INIT_TIMEOUT_MS = 10_000;

/**
 * Ensures the offscreen document exists and is ready to process requests.
 * Creates it if needed and waits for the ready signal.
 */
async function ensureOffscreenDocument(): Promise<void> {
  const hasDoc = await chrome.offscreen.hasDocument();
  if (hasDoc) {
    console.log('[PDF Extraction] Offscreen document already exists');
    return;
  }

  console.log('[PDF Extraction] Creating offscreen document');
  
  // Set up listener BEFORE creating the document to catch OFFSCREEN_READY
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error('Offscreen document failed to initialize within timeout'));
    }, INIT_TIMEOUT_MS);

    const listener = (message: { type: string }) => {
      if (message.type === 'OFFSCREEN_READY') {
        console.log('[PDF Extraction] Offscreen document ready');
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        resolve();
      }
    };

    // Add listener FIRST, then create document
    chrome.runtime.onMessage.addListener(listener);
    
    chrome.offscreen.createDocument({
      url: chrome.runtime.getURL(OFFSCREEN_PATH),
      reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
      justification: 'PDF text extraction requires pdf.js with DOM APIs',
    }).catch((error) => {
      chrome.runtime.onMessage.removeListener(listener);
      clearTimeout(timeout);
      reject(new Error(`Failed to create offscreen document: ${error.message || String(error)}`));
    });
  });
}

/**
 * Extract text from a PDF at the given URL.
 * 
 * @param pdfUrl - URL of the PDF to extract
 * @returns Promise resolving to extracted pages
 * @throws Error if extraction fails
 */
export async function extractPdfText(pdfUrl: string): Promise<PdfExtractionResult> {
  console.log('[PDF Extraction] Starting extraction for:', pdfUrl);
  
  await ensureOffscreenDocument();

  // Send extraction request and await direct response
  const response = await chrome.runtime.sendMessage({
    type: 'EXTRACT_PDF',
    pdfUrl,
  });

  if (!response) {
    throw new Error('No response from offscreen document');
  }

  if (!response.success) {
    throw new Error(response.error || 'PDF extraction failed');
  }

  console.log('[PDF Extraction] Successfully extracted', response.pages?.length, 'pages');
  
  return {
    pages: response.pages,
    metadata: response.metadata,
  };
}

/**
 * Close the offscreen document if it exists.
 * Call this to free resources when extraction is complete.
 */
export async function closeOffscreenDocument(): Promise<void> {
  const hasDoc = await chrome.offscreen.hasDocument();
  if (hasDoc) {
    await chrome.offscreen.closeDocument();
    console.log('[PDF Extraction] Closed offscreen document');
  }
}
