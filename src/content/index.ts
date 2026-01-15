import { detectPaper } from './adapters';

// Debug helper: Log that content script is loaded
console.log('[Content Script] PaperLens content script loaded');
console.log('[Content Script] PDF URL extraction logs will appear in this console (page DevTools)');

// Listen for messages from background or side panel
chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === 'DETECT_PAPER') {
    try {
      const detected = detectPaper(window.location.href, document);
      sendResponse({ success: true, data: detected });
    } catch (error) {
      console.error('Paper detection error:', error);
      sendResponse({ success: false, error: String(error) });
    }
    return true; // Keep channel open for async response
  }
});

// Auto-detect on page load and notify background
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    notifyPaperDetection();
  });
} else {
  notifyPaperDetection();
}

function notifyPaperDetection() {
  try {
    const detected = detectPaper(window.location.href, document);
    if (detected) {
      chrome.runtime.sendMessage({
        type: 'PAPER_DETECTED',
        data: detected,
      });
    }
  } catch (error) {
    console.error('Auto-detection error:', error);
  }
}
