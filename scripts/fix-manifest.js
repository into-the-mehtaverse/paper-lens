#!/usr/bin/env node
// Post-build script to fix manifest paths
// Note: CRXJS outputs files to dist/src/, so paths should keep src/ prefix
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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

// Ensure web accessible resources have src/ prefix
if (manifest.web_accessible_resources) {
  manifest.web_accessible_resources.forEach((resource) => {
    if (resource.resources) {
      resource.resources = resource.resources.map((r) => {
        // Don't modify asset paths (they're already correct)
        if (r.startsWith('assets/')) return r;
        // Add src/ prefix if missing
        return r.startsWith('src/') ? r : `src/${r}`;
      });
    }
  });
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Fixed manifest paths');
