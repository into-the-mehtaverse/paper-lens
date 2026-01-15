import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/components/card';
import '../ui/styles.css';

function Options() {
  const [config, setConfig] = useState({
    provider: 'openai',
    apiKey: '',
    model: 'gpt-5.2',
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const result = await chrome.storage.sync.get(['llmConfig']);
      if (result.llmConfig) {
        setConfig({ ...config, ...result.llmConfig });
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  async function saveConfig() {
    try {
      await chrome.storage.sync.set({ llmConfig: config });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('Failed to save configuration. Please try again.');
    }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">PaperLens Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure your LLM provider and API keys
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>LLM Provider Configuration</CardTitle>
            <CardDescription>
              Choose your language model provider and enter your API key
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="provider" className="text-sm font-medium">
                Provider
              </label>
              <select
                id="provider"
                value={config.provider}
                onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama (Local)</option>
                <option value="anthropic" disabled>Anthropic (Coming Soon)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="apiKey" className="text-sm font-medium">
                API Key {config.provider === 'ollama' && '(Optional - defaults to localhost:11434)'}
              </label>
              <input
                id="apiKey"
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                placeholder={config.provider === 'ollama' ? 'Leave empty for localhost' : 'Enter your API key'}
                className="w-full px-3 py-2 border rounded-md"
              />
              {config.provider === 'openai' && (
                <p className="text-xs text-muted-foreground">
                  Get your API key from{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    platform.openai.com/api-keys
                  </a>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="model" className="text-sm font-medium">
                Model
              </label>
              <input
                id="model"
                type="text"
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                placeholder="gpt-5.2"
                className="w-full px-3 py-2 border rounded-md"
              />
              <p className="text-xs text-muted-foreground">
                Default: gpt-5.2 (OpenAI) or llama2 (Ollama). Options: gpt-5.2, gpt-5.1, gpt-5-mini, gpt-5-nano
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="embeddingModel" className="text-sm font-medium">
                Embedding Model
              </label>
              <input
                id="embeddingModel"
                type="text"
                value={config.embeddingModel}
                onChange={(e) => setConfig({ ...config, embeddingModel: e.target.value })}
                placeholder="text-embedding-3-small"
                className="w-full px-3 py-2 border rounded-md"
              />
              <p className="text-xs text-muted-foreground">
                Default: text-embedding-3-small (OpenAI) or nomic-embed-text (Ollama)
              </p>
            </div>

            <Button onClick={saveConfig} className="w-full">
              {saved ? '✓ Saved!' : 'Save Configuration'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy & Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              All data is stored locally in your browser. Your API keys are stored securely
              in Chrome's sync storage and never sent to any server except your chosen LLM provider.
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                if (confirm('Clear all stored papers and data?')) {
                  // This would call the clearAll function from the background
                  chrome.runtime.sendMessage({ type: 'CLEAR_ALL' });
                  alert('All data cleared!');
                }
              }}
            >
              Clear All Data
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Options />);
}
