import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/components/card';
import { Button } from '@/components/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/components/tabs';
import { Progress } from '@/components/ui/components/progress';
import type { PaperMetadata, StoredAnalysis, Analysis } from '@/schemas';
import '../ui/styles.css';

function SidePanel() {
  const [paper, setPaper] = useState<PaperMetadata | null>(null);
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; progress: number } | null>(null);

  useEffect(() => {
    // Listen for paper detection
    chrome.runtime.onMessage.addListener((message: any) => {
      if (message.type === 'PAPER_UPDATED') {
        setPaper(message.data);
        loadAnalysis(message.data.paperId);
      } else if (message.type === 'ANALYSIS_PROGRESS') {
        setProgress({
          stage: message.stage,
          progress: getProgressForStage(message.stage),
        });
      } else if (message.type === 'ANALYSIS_COMPLETE') {
        setAnalysis(message.analysis);
        setLoading(false);
        setProgress(null);
        loadPaper(message.paperId);
      }
    });

    // Try to detect paper on current tab
    detectCurrentPaper();
  }, []);

  async function detectCurrentPaper() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url) return;

      // Check if content script can be injected (only works on http/https pages)
      if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_PAPER' });
        if (response?.success && response.data) {
          setPaper(response.data.metadata);
          loadAnalysis(response.data.metadata.paperId);
        }
      } catch (error: any) {
        // Content script might not be loaded - this is normal for some pages
        // The content script should auto-detect and send PAPER_DETECTED message
        // which will be handled by the message listener above
        if (error.message?.includes('Could not establish connection')) {
          console.log('Content script not available on this page (this is normal for some pages)');
        } else {
          console.error('Detection error:', error);
        }
      }
    } catch (error) {
      console.error('Detection error:', error);
    }
  }

  async function loadPaper(paperId: string) {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PAPER',
      paperId,
    });
    if (response.success && response.data) {
      setPaper(response.data);
    }
  }

  async function loadAnalysis(_paperId: string) {
    // Load analysis from storage
    // This would typically come from IndexedDB via background
    // For now, we'll rely on messages
  }

  async function handleAnalyze() {
    if (!paper) return;

    // Check if API key is configured
    try {
      const result = await chrome.storage.sync.get(['llmConfig']);
      const config = result.llmConfig as { apiKey?: string; provider?: string } | undefined;
      if (!config?.apiKey && config?.provider !== 'ollama') {
        const openOptions = confirm(
          'No API key configured. Would you like to open settings to configure it?'
        );
        if (openOptions) {
          chrome.runtime.openOptionsPage();
        }
        return;
      }
    } catch (error) {
      console.error('Failed to check config:', error);
    }

    setLoading(true);
    setProgress({ stage: 'starting', progress: 0 });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_PAPER',
        paperId: paper.paperId,
        options: {},
      });

      if (response && !response.success) {
        throw new Error(response.error || 'Analysis failed');
      }
    } catch (error: any) {
      console.error('Analysis error:', error);
      setLoading(false);
      setProgress(null);
      alert(`Analysis failed: ${error.message || 'Unknown error'}. Check console for details.`);
    }
  }

  function getProgressForStage(stage: string): number {
    const stages = ['extraction', 'embedding', 'retrieval', 'generation'];
    const index = stages.indexOf(stage);
    return index >= 0 ? ((index + 1) / (stages.length + 1)) * 100 : 0;
  }

  return (
    <div className="w-full h-screen overflow-auto bg-background">
      <div className="p-4 space-y-4">
        {/* Detected Paper Card */}
        {paper ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{paper.title}</CardTitle>
              <CardDescription>
                {paper.authors.join(', ')}
                {paper.venue && ` • ${paper.venue}`}
                {paper.year && ` • ${paper.year}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? 'Analyzing...' : 'Analyze'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    chrome.runtime.sendMessage({
                      type: 'SAVE_PAPER',
                      paperId: paper.paperId,
                    });
                  }}
                >
                  {paper.saved ? 'Saved' : 'Save'}
                </Button>
              </div>
              {paper.analyzed && (
                <p className="text-sm text-muted-foreground">✓ Analyzed</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground mb-4">
                No paper detected. Navigate to an arXiv or OpenReview paper page.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => chrome.runtime.openOptionsPage()}
              >
                ⚙️ Open Settings
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Progress Indicator */}
        {loading && progress && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Analyzing...</span>
                  <span>{progress.stage}</span>
                </div>
                <Progress value={progress.progress} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="critique" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="critique">Critique</TabsTrigger>
            <TabsTrigger value="related">Related</TabsTrigger>
            <TabsTrigger value="recommendations">Recommend</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
          </TabsList>

          <TabsContent value="critique" className="mt-4">
            {analysis ? (
              <CritiqueView analysis={analysis.analysis} />
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    No analysis yet. Click "Analyze" to generate a critique.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="related" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Related papers will appear here after analysis.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recommendations" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Recommendations will appear here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="library" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Your library will appear here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function CritiqueView({ analysis }: { analysis: Analysis }) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-1">
            {analysis.summaryBullets.map((bullet, i) => (
              <li key={i} className="text-sm">{bullet}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Key Claims */}
      <Card>
        <CardHeader>
          <CardTitle>Key Claims</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {analysis.keyClaims.map((claim, i) => (
            <div key={i} className="border-l-2 pl-3">
              <p className="text-sm">{claim.claim}</p>
              {claim.evidence && claim.evidence.length > 0 && (
                <EvidenceSpans evidence={claim.evidence} />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Questions */}
      <Card>
        <CardHeader>
          <CardTitle>Questions Raised</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {analysis.questions.map((q, i) => (
            <div key={i} className="border-l-2 pl-3">
              <p className="text-sm font-medium">{q.question}</p>
              <EvidenceSpans evidence={q.evidence} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Missing Ablations */}
      <Card>
        <CardHeader>
          <CardTitle>Missing Ablations/Baselines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {analysis.missingAblations.map((ablation, i) => (
            <div key={i} className="border-l-2 pl-3">
              <p className="text-sm">{ablation.description}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Suggested: {ablation.suggestedExperiment}
              </p>
              <EvidenceSpans evidence={ablation.evidence} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Potential Issues */}
      <Card>
        <CardHeader>
          <CardTitle>Potential Issues</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {analysis.potentialIssues.map((issue, i) => (
            <div key={i} className="border-l-2 pl-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  issue.severity === 'High' ? 'bg-red-100 text-red-800' :
                  issue.severity === 'Med' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {issue.severity}
                </span>
                <span className="text-xs text-muted-foreground">
                  Confidence: {(issue.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-sm">{issue.issue}</p>
              {issue.suggestedCheck && (
                <p className="text-xs text-muted-foreground mt-1">
                  Check: {issue.suggestedCheck}
                </p>
              )}
              <EvidenceSpans evidence={issue.evidence} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Replication Checklist */}
      <Card>
        <CardHeader>
          <CardTitle>Replication Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-1">
            {analysis.replicationChecklist.map((item, i) => (
              <li key={i} className="text-sm">{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Next Week Tests */}
      <Card>
        <CardHeader>
          <CardTitle>What I'd Test Next Week</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-1">
            {analysis.nextWeekTests.map((test, i) => (
              <li key={i} className="text-sm">{test}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function EvidenceSpans({ evidence }: { evidence: Array<{ chunkId: string; quote: string; location: any }> }) {
  return (
    <div className="mt-2 space-y-1">
      {evidence.map((ev, i) => (
        <div key={i} className="text-xs bg-muted p-2 rounded">
          <p className="font-mono text-muted-foreground">"{ev.quote}"</p>
          {ev.location.section && (
            <p className="text-muted-foreground mt-1">Section: {ev.location.section}</p>
          )}
          {ev.location.pageStart && (
            <p className="text-muted-foreground">Page: {ev.location.pageStart}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// Initialize React app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<SidePanel />);
}
