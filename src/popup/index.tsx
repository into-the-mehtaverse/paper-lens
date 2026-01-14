import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/ui/components/button';
import '../ui/styles.css';

function Popup() {
  const [paper, setPaper] = useState<any>(null);

  useEffect(() => {
    // Try to detect paper
    detectCurrentPaper();
  }, []);

  async function detectCurrentPaper() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_PAPER' });
      if (response.success && response.data) {
        setPaper(response.data.metadata);
      }
    } catch (error) {
      console.error('Detection error:', error);
    }
  }

  async function openSidePanel() {
    try {
      // Get the current window
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.windowId) {
        console.error('No window ID found');
        return;
      }

      // Open side panel for the current window
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (error) {
      console.error('Error opening side panel:', error);
      // Try getting window directly
      try {
        const window = await chrome.windows.getCurrent();
        if (window.id) {
          await chrome.sidePanel.open({ windowId: window.id });
        }
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }
  }

  return (
    <div className="w-64 p-4 space-y-3">
      <h1 className="text-lg font-bold">PaperLens</h1>

      {paper ? (
        <div className="space-y-2">
          <p className="text-sm font-medium truncate">{paper.title}</p>
          <p className="text-xs text-muted-foreground">
            {paper.authors.slice(0, 2).join(', ')}
            {paper.authors.length > 2 && '...'}
          </p>
          <Button onClick={openSidePanel} className="w-full" size="sm">
            Open Side Panel
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            No paper detected on this page.
          </p>
          <Button onClick={openSidePanel} className="w-full" size="sm">
            Open Side Panel
          </Button>
        </div>
      )}

      <div className="pt-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          ⚙️ Settings
        </Button>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}
