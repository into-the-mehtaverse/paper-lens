# PaperLens

Personal Research Paper Copilot Chrome Extension

## Overview

PaperLens is a Chrome extension that detects research papers, extracts content, generates reviewer-style critiques with evidence, and maintains a personal reading library.

## Features (Milestone 1)

- ✅ Paper detection for arXiv and OpenReview
- ✅ PDF extraction via PaperLens Reader
- ✅ Chunking and embeddings
- ✅ Task-specific retrieval
- ✅ LLM-powered critique generation with evidence spans
- ✅ Side panel UI for viewing critiques

## Tech Stack

- **Language**: TypeScript
- **UI**: React + Tailwind + shadcn/ui
- **Extension tooling**: Vite + CRXJS
- **PDF**: pdf.js (Reader page)
- **DB**: IndexedDB via Dexie
- **State Management**: Zustand
- **LLM/Embeddings**: OpenAI (default), optional Ollama
- **Schemas**: Zod
- **Tests**: Vitest + Playwright

## Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Setup

```bash
# Install dependencies
pnpm install

# Build extension
pnpm build

# Development mode
pnpm dev
```

### Loading the Extension

1. Build the extension: `pnpm build`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `dist` directory

### Configuration

Before using the extension, configure your LLM provider:

1. Open the extension options (right-click extension icon → Options)
2. Enter your OpenAI API key (or configure Ollama)
3. Select your preferred models

## Project Structure

```
src/
├── background/     # Service worker for orchestration
├── content/        # Content scripts and site adapters
├── reader/         # PDF reader with pdf.js
├── store/          # IndexedDB via Dexie
├── llm/            # LLM provider abstraction
├── embed/          # Embeddings abstraction
├── retrieval/      # Vector search and retrieval
├── schemas/        # Zod schemas
├── ui/             # Shared UI components
├── sidepanel/      # Side panel UI
├── popup/          # Popup UI
└── utils/          # Utilities (chunking, etc.)
```

## Usage

1. Navigate to an arXiv or OpenReview paper page
2. The extension will automatically detect the paper
3. Click "Analyze" in the side panel to generate a critique
4. View the structured critique with evidence spans
5. Papers are automatically saved to your local library

## Privacy

- All data is stored locally in IndexedDB
- You control what content is sent to LLM providers
- Privacy modes: abstract-only, snippets, or full-text

## License

Open source - see LICENSE file
