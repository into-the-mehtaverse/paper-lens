# Debugging Side Panel Issues

## If the side panel button doesn't work:

1. **Check the browser console**:
   - Right-click the extension icon → "Inspect popup"
   - Look for any JavaScript errors
   - Check the Console tab for error messages

2. **Check the service worker**:
   - Go to `chrome://extensions/`
   - Find PaperLens
   - Click "service worker" (or "background page")
   - Check for errors in the console

3. **Verify side panel is enabled**:
   - The side panel should be enabled automatically on install
   - If not, you can manually enable it in the extension's service worker console:
     ```javascript
     chrome.sidePanel.setOptions({
       path: 'src/sidepanel/index.html',
       enabled: true,
     });
     ```

4. **Try opening side panel manually**:
   - Right-click the extension icon
   - Look for "Open side panel" option
   - If it's there, the side panel is configured correctly

5. **Check manifest**:
   - Verify `sidePanel` permission is in manifest.json
   - Verify `side_panel.default_path` is set correctly

## Common Issues:

### "sidePanel.open is not a function"
- Make sure Chrome version is 114+ (side panel API was added in Chrome 114)
- Check that `sidePanel` permission is in manifest

### Side panel opens but is blank
- Check the side panel console (right-click side panel → Inspect)
- Verify `src/sidepanel/index.html` exists in dist folder
- Check for JavaScript errors in side panel

### Button does nothing
- Check popup console for errors
- Verify `chrome.sidePanel.open()` is being called
- Check service worker is running
