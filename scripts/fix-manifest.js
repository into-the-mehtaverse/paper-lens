#!/usr/bin/env node
// Post-build script to fix manifest paths
// Note: CRXJS outputs files to dist/src/, so paths should keep src/ prefix
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

const manifestPath = join(process.cwd(), 'dist', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

// CRXJS keeps src/ prefix in paths, which is correct since files are in dist/src/
// But we need to ensure HTML paths also have src/ prefix
if (manifest.side_panel?.default_path && !manifest.side_panel.default_path.startsWith('src/')) {
  manifest.side_panel.default_path = `src/${manifest.side_panel.default_path}`;
}

if (manifest.action?.default_popup && !manifest.action.default_popup.startsWith('src/')) {
  manifest.action.default_popup = `src/${manifest.action.default_popup}`;
}

// Ensure icon paths have src/ prefix
if (manifest.icons) {
  Object.keys(manifest.icons).forEach(size => {
    if (!manifest.icons[size].startsWith('src/')) {
      manifest.icons[size] = `src/${manifest.icons[size]}`;
    }
  });
}

if (manifest.action?.default_icon) {
  Object.keys(manifest.action.default_icon).forEach(size => {
    if (!manifest.action.default_icon[size].startsWith('src/')) {
      manifest.action.default_icon[size] = `src/${manifest.action.default_icon[size]}`;
    }
  });
}

// Ensure web accessible resources have src/ prefix (except for root-level public files)
if (manifest.web_accessible_resources) {
  manifest.web_accessible_resources.forEach((resource) => {
    if (resource.resources) {
      resource.resources = resource.resources.map((r) => {
        // Don't modify asset paths (they're already correct)
        if (r.startsWith('assets/')) return r;
        // Don't modify root-level files from public/ (pdf.js files)
        if (r.endsWith('.mjs') || r.endsWith('.js')) return r;
        // Add src/ prefix if missing
        return r.startsWith('src/') ? r : `src/${r}`;
      });
    }
  });
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Fixed manifest paths');

// Copy pdf.js worker file to dist/assets for Chrome extension use
// Vite copies public/ files to dist/ root, so we need to ensure it's in the right place
try {
  // Check if worker was copied from public/ (vite does this automatically)
  const distWorkerPath = join(process.cwd(), 'dist', 'assets', 'pdf.worker.min.mjs');
  if (!existsSync(distWorkerPath)) {
    // Fallback: copy from node_modules if not in public/
    const pdfjsWorkerPath = join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
    const distAssetsPath = join(process.cwd(), 'dist', 'assets');
    
    if (existsSync(pdfjsWorkerPath)) {
      if (!existsSync(distAssetsPath)) {
        mkdirSync(distAssetsPath, { recursive: true });
      }
      copyFileSync(pdfjsWorkerPath, distWorkerPath);
      console.log('Copied pdf.js worker to dist/assets');
    } else {
      console.warn('Could not find pdf.js worker file');
    }
  } else {
    console.log('pdf.js worker already in dist/assets (copied by vite)');
  }
} catch (error) {
  console.warn('Could not copy pdf.js worker:', error.message);
}

// Fix offscreen HTML to use correct script path from vite manifest
const viteManifestPath = join(process.cwd(), 'dist', '.vite', 'manifest.json');
const offscreenHtmlPath = join(process.cwd(), 'dist', 'src', 'offscreen', 'index.html');

try {
  const viteManifest = JSON.parse(readFileSync(viteManifestPath, 'utf-8'));
  // Find the entry for offscreen/index.html or offscreen/index.ts
  const offscreenEntry = Object.entries(viteManifest).find(([key]) => 
    key.includes('offscreen/index') || key === 'offscreen'
  );
  
  if (offscreenEntry) {
    const [, entry] = offscreenEntry;
    const assetFile = entry.file;
    const offscreenHtml = readFileSync(offscreenHtmlPath, 'utf-8');
    // Replace the script reference with the bundled asset
    // Use relative path from offscreen HTML location (dist/src/offscreen/) to assets (dist/assets/)
    // Vite may have already transformed it to /assets/..., so handle both cases
    let fixedHtml = offscreenHtml;
    if (offscreenHtml.includes('./index.ts')) {
      fixedHtml = offscreenHtml.replace(
        /<script type="module" src="\.\/index\.ts"><\/script>/,
        `<script type="module" crossorigin src="../../assets/${assetFile}"></script>`
      );
    } else {
      // Vite already transformed it to use /assets/ paths
      // Convert to relative paths (from dist/src/offscreen/ to dist/assets/)
      fixedHtml = offscreenHtml.replace(
        /(src|href)="\/assets\/([^"]+)"/g,
        `$1="../../assets/$2"`
      );
      console.log('Converted absolute asset paths to relative paths');
    }
    writeFileSync(offscreenHtmlPath, fixedHtml);
    console.log('Fixed offscreen HTML script path:', assetFile);
  } else {
    // Offscreen HTML not in vite manifest - fix the inline import to use chrome.runtime.getURL
    const offscreenHtml = readFileSync(offscreenHtmlPath, 'utf-8');
    if (offscreenHtml.includes("import { extractPdfText } from '../components/reader/pdf-extractor'")) {
      const fixedHtml = offscreenHtml.replace(
        /import { extractPdfText } from '\.\.\/components\/reader\/pdf-extractor';/,
        `const { extractPdfText } = await import(chrome.runtime.getURL('src/components/reader/pdf-extractor.js'));`
      );
      // Wrap the script content in an async IIFE since we're using await
      const wrappedHtml = fixedHtml.replace(
        /<script type="module">\s*\/\/ Import pdf-extractor[\s\S]*?chrome\.runtime\.onMessage\.addListener/,
        `<script type="module">
    (async () => {
      const { extractPdfText } = await import(chrome.runtime.getURL('src/components/reader/pdf-extractor.js'));
      
      // Listen for messages from background script
      chrome.runtime.onMessage.addListener`
      ).replace(
        /chrome\.runtime\.sendMessage\(\{ type: 'OFFSCREEN_READY' \}\);[\s\S]*?<\/script>/,
        `chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });
    })();
  </script>`
      );
      writeFileSync(offscreenHtmlPath, wrappedHtml);
      console.log('Fixed offscreen HTML to use chrome.runtime.getURL for import');
    }
  }
} catch (error) {
  console.warn('Could not fix offscreen HTML:', error.message);
}
