#!/usr/bin/env node
// Verify build output is correct
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const distDir = join(process.cwd(), 'dist');
const manifestPath = join(distDir, 'manifest.json');

console.log('Verifying build...\n');

// Check manifest exists
if (!existsSync(manifestPath)) {
  console.error('❌ manifest.json not found in dist/');
  process.exit(1);
}
console.log('✅ manifest.json exists');

// Parse manifest
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

// Check icons
const iconSizes = ['16', '32', '48', '128'];
let allIconsExist = true;

console.log('\nChecking icons:');
for (const size of iconSizes) {
  const iconPath = manifest.icons?.[size];
  if (!iconPath) {
    console.error(`❌ Icon ${size} not found in manifest`);
    allIconsExist = false;
    continue;
  }

  const fullPath = join(distDir, iconPath);
  if (!existsSync(fullPath)) {
    console.error(`❌ Icon file missing: ${iconPath} (expected at ${fullPath})`);
    allIconsExist = false;
    continue;
  }

  const stats = statSync(fullPath);
  if (stats.size === 0) {
    console.error(`❌ Icon file is empty: ${iconPath}`);
    allIconsExist = false;
    continue;
  }

  console.log(`✅ icon-${size}.png exists (${stats.size} bytes) at ${iconPath}`);
}

if (!allIconsExist) {
  console.error('\n❌ Some icons are missing or invalid');
  console.log('\nTry running: node scripts/generate-icons.js && pnpm build');
  process.exit(1);
}

console.log('\n✅ All icons verified!');
console.log('\nIf Chrome still shows errors:');
console.log('1. Remove the extension from chrome://extensions/');
console.log('2. Close and reopen Chrome');
console.log('3. Load unpacked from the dist/ folder again');
