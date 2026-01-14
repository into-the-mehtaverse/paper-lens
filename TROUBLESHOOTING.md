# Troubleshooting Extension Loading

## Icon Loading Errors

If you're getting "Could not load icon" errors:

1. **Remove and re-add the extension**:
   - Go to `chrome://extensions/`
   - Click "Remove" on PaperLens
   - Click "Load unpacked" and select the `dist` folder again

2. **Verify icon files exist**:
   ```bash
   ls -lh dist/src/icons/
   ```
   All 4 icon files should exist and be > 0 bytes

3. **Check manifest paths**:
   ```bash
   cat dist/manifest.json | grep icons
   ```
   Paths should be `src/icons/icon-16.png` etc.

4. **Clear Chrome cache**:
   - Close all Chrome windows
   - Restart Chrome
   - Try loading again

## Common Issues

### Icons are empty/0 bytes
**Solution**: Run `node scripts/generate-icons.js` to create valid placeholder icons

### Manifest paths incorrect
**Solution**: The build script should fix this automatically. If not, check `scripts/fix-manifest.js`

### Extension loads but icons don't show
**Solution**: The placeholder icons are 1x1 pixels. Replace with actual icon images:
- Create 16x16, 32x32, 48x48, and 128x128 PNG files
- Place them in `src/icons/`
- Rebuild: `pnpm build`

## Verification Checklist

- [ ] Icons exist: `dist/src/icons/icon-*.png` (all 4 sizes)
- [ ] Icons are valid PNGs: `file dist/src/icons/icon-16.png` should show "PNG image"
- [ ] Manifest paths correct: `src/icons/icon-16.png` (with `src/` prefix)
- [ ] Extension removed and re-added in Chrome
- [ ] Chrome cache cleared
