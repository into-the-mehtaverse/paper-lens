# Setup Guide

## Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Chrome browser

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```

## Development

1. Start development server:
   ```bash
   pnpm dev
   ```

2. Build for production:
   ```bash
   pnpm build
   ```

3. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` directory

## Configuration

Before using the extension, you need to configure your LLM provider:

1. Right-click the extension icon → Options (or create an options page)
2. Enter your OpenAI API key
3. Select your preferred models:
   - LLM: `gpt-4-turbo-preview` (default)
   - Embeddings: `text-embedding-3-small` (default)

## Icon Setup

The extension requires icon files. Currently, placeholder files exist at `src/icons/`.

**Before building for production**, replace these with actual PNG icons:
- `icon-16.png` (16x16)
- `icon-32.png` (32x32)
- `icon-48.png` (48x48)
- `icon-128.png` (128x128)

You can create these from a single high-resolution icon using image editing software.

## Usage

1. Navigate to an arXiv paper (e.g., `https://arxiv.org/abs/2301.00001`)
2. The extension will automatically detect the paper
3. Open the side panel (click extension icon → "Open Side Panel")
4. Click "Analyze" to generate a critique
5. View the structured critique with evidence spans

## Troubleshooting

### Extension not detecting papers
- Ensure you're on a supported site (arXiv or OpenReview)
- Check browser console for errors
- Verify content script is loaded (check `chrome://extensions/` → Details → Inspect views)

### Analysis fails
- Verify API key is configured correctly
- Check browser console for API errors
- Ensure you have sufficient API credits/quota

### Build errors
- Clear `node_modules` and reinstall: `rm -rf node_modules && pnpm install`
- Check Node.js version: `node --version` (should be 18+)
