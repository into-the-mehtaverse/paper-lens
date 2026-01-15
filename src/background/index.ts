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
import { extractPdfText, closeOffscreenDocument } from './services/pdf-extraction';

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

// Listen for messages from content scripts, popup, sidepanel, etc.
chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  // Ignore internal messages from offscreen document
  if (message.type === 'OFFSCREEN_READY') {
    return false;
  }
  
  console.log('[Background] Received message:', message.type);
  
  if (message.type === 'PAPER_DETECTED') {
    handlePaperDetected(message.data);
    sendResponse({ success: true });
  } else if (message.type === 'ANALYZE_PAPER') {
    handleAnalyzePaper(message.paperId, message.options)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true; // Keep channel open for async
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
  console.log('[Background] handleAnalyzePaper called for:', paperId, {
    existingChunks: chunks.length,
    hasPdfUrl: !!paper.pdfUrl,
    source: paper.source,
  });

  // If no chunks, extract content
  if (chunks.length === 0) {
    console.log('[Background] No chunks found, starting extraction');
    // Notify UI of extraction progress
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_PROGRESS',
      stage: 'extraction',
      paperId: paper.paperId,
    });

    if (paper.pdfUrl && (paper.source === 'arxiv' || paper.source === 'openreview' || paper.source === 'pdf')) {
      console.log('[Background] Extracting PDF:', paper.pdfUrl);
      try {
        // Use the clean extraction service
        const pdfData = await extractPdfText(paper.pdfUrl);

        if (pdfData.pages.length === 0) {
          throw new Error('PDF extraction returned no pages');
        }

        chunks = chunkPdfPages(pdfData.pages, paperId);

        if (chunks.length === 0) {
          throw new Error('No chunks created from PDF');
        }

        // Log extraction results
        const sectionCounts = chunks.reduce((acc, chunk) => {
          const section = chunk.section || 'unknown';
          acc[section] = (acc[section] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        console.log('[Background] PDF extraction complete:', {
          pages: pdfData.pages.length,
          chunks: chunks.length,
          sections: sectionCounts,
        });

        await saveChunks(chunks);
        
        // Close offscreen document to free resources
        await closeOffscreenDocument();
      } catch (error) {
        console.error('[Background] PDF extraction failed:', error);
        
        // Fall back to abstract-only if PDF fails
        if (paper.abstract) {
          const { chunkText } = await import('@/rag/chunking');
          chunks = chunkText(paper.abstract, {}, { paperId });
          if (chunks.length > 0) {
            await saveChunks(chunks);
            console.log('[Background] Using abstract-only content for analysis');
          } else {
            throw new Error('Failed to create chunks from abstract.');
          }
        } else {
          throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : String(error)}. No abstract available.`);
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
    console.log('[Background] Generating embeddings for', chunks.length, 'chunks');
    // Generate embeddings for all chunks
    const texts = chunks.map(c => c.text);
    const vectors = await embedProvider.embedBatch(texts);
    console.log('[Background] Generated', vectors.length, 'embeddings');

    embeddings = chunks.map((chunk, i) => ({
      paperId: paper.paperId,
      chunkId: chunk.chunkId,
      vector: vectors[i],
      model: config.embeddingModel || 'text-embedding-3-small',
      createdAt: Date.now(),
    }));

    await saveEmbeddings(embeddings);
    console.log('[Background] Saved', embeddings.length, 'embeddings to database');
  } else {
    console.log('[Background] Using existing embeddings:', embeddings.length);
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

  // Diagnostic: Log chunk and embedding status
  console.log('[Background] Starting retrieval:', {
    totalChunks: chunks.length,
    totalEmbeddings: embeddings.length,
    chunksWithEmbeddings: chunks.filter(c => embeddingMap.has(c.chunkId)).length,
    chunksBySection: Object.entries(
      chunks.reduce((acc, c) => {
        const section = c.section || 'no-section';
        acc[section] = (acc[section] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ),
  });

  const retrievedChunks: Record<string, Chunk[]> = {};

  for (const [task, taskConfig] of Object.entries(TASK_RETRIEVAL_CONFIGS)) {
    // Diagnostic: Log what sections we're filtering for
    const sectionsToMatch = taskConfig.sections || [];
    const chunksMatchingSections = chunks.filter(chunk => {
      if (!chunk.section) return false;
      return sectionsToMatch.some(section =>
        chunk.section!.toLowerCase().includes(section.toLowerCase())
      );
    });
    console.log(`[Background] Task ${task}:`, {
      requestedSections: sectionsToMatch,
      chunksMatchingSections: chunksMatchingSections.length,
      sectionsFound: [...new Set(chunksMatchingSections.map(c => c.section))],
    });

    const results = retrieveForTask(
      centroid,
      chunks,
      embeddingMap,
      taskConfig.k,
      { sections: taskConfig.sections ? [...taskConfig.sections] : undefined }
    );
    retrievedChunks[task] = results.map(r => r.chunk);
    
    // Diagnostic: Log retrieval results
    const retrievedSections = retrievedChunks[task].map(c => c.section || 'unknown');
    const sectionCounts = retrievedSections.reduce((acc, s) => {
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`[Background] Retrieved chunks for ${task}:`, {
      count: retrievedChunks[task].length,
      sections: sectionCounts,
      pages: retrievedChunks[task].map(c => c.pageStart).filter(Boolean),
      topScores: results.slice(0, 3).map(r => r.score),
    });
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
