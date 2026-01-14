import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { extractPdfText, type PdfPage } from './pdf-extractor';
import '../ui/styles.css';

function PdfReader() {
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    // Get PDF URL from URL params or message
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');

    if (url) {
      setPdfUrl(url);
      loadPdf(url);
    } else {
      // Listen for messages from extension
      chrome.runtime.onMessage.addListener((message: any) => {
        if (message.type === 'LOAD_PDF') {
          setPdfUrl(message.url);
          loadPdf(message.url);
        }
      });
    }
  }, []);

  async function loadPdf(url: string) {
    try {
      setLoading(true);
      setError(null);
      const result = await extractPdfText(url);
      setPages(result.pages);
      setCurrentPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PDF');
    } finally {
      setLoading(false);
    }
  }

  function handleAnalyze() {
    if (pdfUrl && pages.length > 0) {
      chrome.runtime.sendMessage({
        type: 'ANALYZE_PDF',
        data: {
          url: pdfUrl,
          pages,
        },
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center text-red-600">
          <p className="text-xl font-bold">Error</p>
          <p className="mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-gray-600">No PDF loaded</p>
        </div>
      </div>
    );
  }

  const currentPageData = pages[currentPage - 1];

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-gray-100 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {currentPage} of {pages.length}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(pages.length, currentPage + 1))}
            disabled={currentPage === pages.length}
            className="px-4 py-2 bg-gray-100 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
        <button
          onClick={handleAnalyze}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Analyze PDF
        </button>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto prose">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {currentPageData.text}
          </div>
        </div>
      </div>
    </div>
  );
}

// Initialize React app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<PdfReader />);
}
