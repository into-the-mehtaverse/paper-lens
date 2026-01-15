import { chunkPdfPages } from '@/rag/chunking';
import { createEmbeddingProvider, computeCentroid } from '@/rag/embed';
import { retrieveForTask, TASK_RETRIEVAL_CONFIGS } from '@/rag/retrieval';
import { createLLMProvider } from '@/rag/generation';
import {
  savePaper,
  getPaper,
  saveChunks,
  getChunks,
  saveEmbeddings,
  getEmbeddings,
  saveAnalysis,
} from '@/db';
import type { PaperMetadata, Chunk, StoredAnalysis } from '@/schemas';

// Debug helper: Log that service worker is loaded
console.log('[Background Service Worker] PaperLens background script loaded');
console.log('[Background Service Worker] To see PDF fetch logs, check this console (chrome://extensions -> Inspect views: service worker)');

// Initialize side panel on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({
    path: 'src/components/sidepanel/index.html',
    enabled: true,
  });
});

// Also set side panel when extension starts (for already installed extensions)
chrome.sidePanel.setOptions({
  path: 'src/components/sidepanel/index.html',
  enabled: true,
});

// Listen for paper detection
chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === 'PAPER_DETECTED') {
    handlePaperDetected(message.data);
    sendResponse({ success: true });
  } else if (message.type === 'ANALYZE_PAPER') {
    handleAnalyzePaper(message.paperId, message.options)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true; // Keep channel open
  } else if (message.type === 'ANALYZE_PDF') {
    handleAnalyzePdf(message.data)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  } else if (message.type === 'GET_PAPER') {
    getPaper(message.paperId)
      .then((paper) => sendResponse({ success: true, data: paper }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  } else if (message.type === 'CLEAR_ALL') {
    import('@/db').then(({ clearAll }) => {
      clearAll()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: String(err) }));
    });
    return true;
  }
});

async function handlePaperDetected(detected: { metadata: PaperMetadata; source: string }) {
  // Check if paper already exists
  const existing = await getPaper(detected.metadata.paperId);

  if (existing) {
    // Update last opened
    await savePaper({
      ...existing,
      lastOpenedAt: Date.now(),
      openCount: existing.openCount + 1,
    });
  } else {
    // Save new paper
    await savePaper(detected.metadata);
  }

  // Notify side panel
  chrome.runtime.sendMessage({
    type: 'PAPER_UPDATED',
    data: detected.metadata,
  });
}

async function handleAnalyzePdf(data: { url: string; pages: Array<{ pageNumber: number; text: string }> }) {
  // Generate paper ID from URL hash
  const paperId = `urlhash:${await hashString(data.url)}`;

  // Create or get paper metadata
  let paper = await getPaper(paperId);
  if (!paper) {
    paper = {
      paperId,
      title: 'PDF Document',
      authors: [],
      source: 'pdf',
      sourceUrl: data.url,
      pdfUrl: data.url,
      firstSeenAt: Date.now(),
      lastOpenedAt: Date.now(),
      openCount: 1,
      saved: false,
      analyzed: false,
      starred: false,
      tags: [],
    };
    await savePaper(paper);
  }

  // Chunk the PDF pages
  const chunks = chunkPdfPages(data.pages, paperId);
  await saveChunks(chunks);

  // Analyze
  await analyzePaper(paper, chunks);
}

async function handleAnalyzePaper(paperId: string, options: any = {}) {
  const paper = await getPaper(paperId);
  if (!paper) {
    throw new Error(`Paper not found: ${paperId}`);
  }

  let chunks = await getChunks(paperId);

  // If no chunks, extract content
  if (chunks.length === 0) {
    // Notify UI of extraction progress
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_PROGRESS',
      stage: 'extraction',
      paperId: paper.paperId,
    });

    if (paper.pdfUrl && (paper.source === 'arxiv' || paper.source === 'openreview' || paper.source === 'pdf')) {
      // Extract from PDF
      console.log('[Background] Starting PDF extraction for paper:', paper.paperId);
      console.log('[Background] Paper source:', paper.source);
      console.log('[Background] PDF URL from paper metadata:', paper.pdfUrl);
      try {
        const { extractPdfText } = await import('@/components/reader/pdf-extractor');
        console.log('[Background] Calling extractPdfText with URL:', paper.pdfUrl);
        const pdfData = await extractPdfText(paper.pdfUrl);
        console.log('[Background] PDF extraction successful, pages:', pdfData.pages.length);

        if (pdfData.pages.length === 0) {
          throw new Error('PDF extraction returned no pages');
        }

        chunks = chunkPdfPages(pdfData.pages, paperId);

        if (chunks.length === 0) {
          throw new Error('No chunks created from PDF');
        }

        await saveChunks(chunks);
      } catch (error) {
        console.error('PDF extraction failed:', error);
        // Fall back to abstract-only if PDF fails
        if (paper.abstract) {
          const { chunkText } = await import('@/rag/chunking');
          chunks = chunkText(paper.abstract, {}, { paperId });
          if (chunks.length > 0) {
            await saveChunks(chunks);
            console.log('Using abstract-only content for analysis');
          } else {
            throw new Error('Failed to create chunks from abstract.');
          }
        } else {
          throw new Error(`Failed to extract PDF: ${error instanceof Error ? error.message : String(error)}. No abstract available as fallback.`);
        }
      }
    } else if (paper.abstract) {
      // Extract from abstract only
      const { chunkText } = await import('@/rag/chunking');
      chunks = chunkText(paper.abstract, {}, { paperId });
      await saveChunks(chunks);
    } else {
      throw new Error('No content available to analyze. Please ensure PDF URL or abstract is available.');
    }
  }

  await analyzePaper(paper, chunks, options);
}

async function analyzePaper(
  paper: PaperMetadata,
  chunks: Chunk[],
  options: any = {}
) {
  if (chunks.length === 0) {
    throw new Error('No content chunks available for analysis.');
  }

  // Notify UI of progress
  chrome.runtime.sendMessage({
    type: 'ANALYSIS_PROGRESS',
    stage: 'embedding',
    paperId: paper.paperId,
  });

  // Get or create embeddings
  const config = await getLLMConfig();
  const embedProvider = createEmbeddingProvider({
    provider: (config.embeddingProvider || 'openai') as 'openai' | 'anthropic' | 'ollama',
    apiKey: config.apiKey,
    model: config.embeddingModel,
  });

  let embeddings = await getEmbeddings(paper.paperId);

  if (embeddings.length === 0) {
    // Generate embeddings for all chunks
    const texts = chunks.map(c => c.text);
    const vectors = await embedProvider.embedBatch(texts);

    embeddings = chunks.map((chunk, i) => ({
      paperId: paper.paperId,
      chunkId: chunk.chunkId,
      vector: vectors[i],
      model: config.embeddingModel || 'text-embedding-3-small',
      createdAt: Date.now(),
    }));

    await saveEmbeddings(embeddings);
  }

  // Compute centroid
  const centroid = await computeCentroid(chunks, embedProvider);

  // Notify UI of progress
  chrome.runtime.sendMessage({
    type: 'ANALYSIS_PROGRESS',
    stage: 'retrieval',
    paperId: paper.paperId,
  });

  // Task-specific retrieval
  const embeddingMap = new Map(embeddings.map(e => [e.chunkId, e]));

  const retrievedChunks: Record<string, Chunk[]> = {};

  for (const [task, taskConfig] of Object.entries(TASK_RETRIEVAL_CONFIGS)) {
    const results = retrieveForTask(
      centroid,
      chunks,
      embeddingMap,
      taskConfig.k,
      { sections: taskConfig.sections ? [...taskConfig.sections] : undefined }
    );
    retrievedChunks[task] = results.map(r => r.chunk);
  }

  // Notify UI of progress
  chrome.runtime.sendMessage({
    type: 'ANALYSIS_PROGRESS',
    stage: 'generation',
    paperId: paper.paperId,
  });

  // Generate analysis with LLM
  const llmProvider = createLLMProvider({
    provider: (config.provider || 'openai') as 'openai' | 'anthropic' | 'ollama',
    apiKey: config.apiKey,
    model: config.model,
  });

  const analysis = await llmProvider.generateAnalysis(
    {
      title: paper.title,
      authors: paper.authors,
      abstract: paper.abstract,
      paperId: paper.paperId,
    },
    retrievedChunks,
    options
  );

  // Ensure analysis.paper.id matches paper.paperId (fix if LLM generated wrong format)
  if (analysis.paper.id !== paper.paperId) {
    analysis.paper.id = paper.paperId;
  }

  // Save analysis
  const storedAnalysis: StoredAnalysis = {
    paperId: paper.paperId,
    analysisVersion: analysis.analysisVersion,
    analysis,
    createdAt: Date.now(),
  };

  await saveAnalysis(storedAnalysis);

  // Update paper as analyzed
  await savePaper({
    ...paper,
    analyzed: true,
  });

  // Notify UI
  chrome.runtime.sendMessage({
    type: 'ANALYSIS_COMPLETE',
    paperId: paper.paperId,
    analysis: storedAnalysis,
  });
}

async function hashString(str: string): Promise<string> {
  // Use Web Crypto API for hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

async function getLLMConfig(): Promise<{
  provider: string;
  apiKey?: string;
  model?: string;
  embeddingProvider?: string;
  embeddingModel?: string;
}> {
  const result = await chrome.storage.sync.get(['llmConfig']);
  const defaultConfig = {
    provider: 'openai',
    model: 'gpt-5.2',
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
  };
  return (result.llmConfig as typeof defaultConfig) || defaultConfig;
}
