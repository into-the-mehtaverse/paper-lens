import OpenAI from 'openai';
import { AnalysisSchema, type Analysis } from '@/schemas';
import type { Chunk } from '@/schemas';

export interface LLMProvider {
  generateAnalysis(
    paperMetadata: { title: string; authors: string[]; abstract?: string; paperId?: string },
    retrievedChunks: Record<string, Chunk[]>,
    options?: AnalysisOptions
  ): Promise<Analysis>;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface AnalysisOptions {
  tone?: 'critical' | 'balanced' | 'experimental';
  privacyMode?: 'abstract-only' | 'snippets' | 'full-text';
}

export class OpenAILLMProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: LLMConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key required');
    }
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'gpt-4-turbo-preview';
  }

  async generateAnalysis(
    paperMetadata: { title: string; authors: string[]; abstract?: string; paperId?: string },
    retrievedChunks: Record<string, Chunk[]>,
    options: AnalysisOptions = {}
  ): Promise<Analysis> {
    const prompt = buildAnalysisPrompt(paperMetadata, retrievedChunks, options);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert research paper reviewer. Generate structured, evidence-based critiques. Always output valid JSON only, no markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    // Parse and validate JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      // Try to repair JSON if it's wrapped in markdown
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error(`Invalid JSON response: ${error}`);
      }
    }

    // Validate against schema
    const validated = AnalysisSchema.parse(parsed);
    return validated;
  }
}

export class OllamaLLMProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor(config: LLMConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'llama2';
  }

  async generateAnalysis(
    paperMetadata: { title: string; authors: string[]; abstract?: string; paperId?: string },
    retrievedChunks: Record<string, Chunk[]>,
    options: AnalysisOptions = {}
  ): Promise<Analysis> {
    const prompt = buildAnalysisPrompt(paperMetadata, retrievedChunks, options);

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: `You are an expert research paper reviewer. Generate structured, evidence-based critiques. Always output valid JSON only, no markdown.\n\n${prompt}`,
        stream: false,
        format: 'json',
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.response;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error(`Invalid JSON response: ${error}`);
      }
    }

    const validated = AnalysisSchema.parse(parsed);
    return validated;
  }
}

/**
 * Create LLM provider from config
 */
export function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAILLMProvider(config);
    case 'ollama':
      return new OllamaLLMProvider(config);
    case 'anthropic':
      // TODO: Implement Anthropic provider
      throw new Error('Anthropic provider not yet implemented');
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Build analysis prompt from paper metadata and retrieved chunks
 */
function buildAnalysisPrompt(
  paperMetadata: { title: string; authors: string[]; abstract?: string; paperId?: string },
  retrievedChunks: Record<string, Chunk[]>,
  options: AnalysisOptions = {}
): string {
  const tone = options.tone || 'balanced';
  const toneInstructions = {
    critical: 'Be more critical and skeptical. Focus on potential weaknesses.',
    balanced: 'Provide balanced, constructive feedback.',
    experimental: 'Focus on experimental rigor and reproducibility.',
  }[tone];

  const chunksText = Object.entries(retrievedChunks)
    .map(([task, chunks]) => {
      const chunksList = chunks
        .map((c) => `[${c.chunkId}] ${c.text.substring(0, 500)}...`)
        .join('\n\n');
      return `## ${task}\n${chunksList}`;
    })
    .join('\n\n');

  return `Analyze this research paper and generate a structured critique.

Paper:
Title: ${paperMetadata.title}
Authors: ${paperMetadata.authors.join(', ')}
${paperMetadata.abstract ? `Abstract: ${paperMetadata.abstract}` : ''}

Retrieved Evidence Chunks:
${chunksText}

Instructions:
${toneInstructions}

Generate a JSON object with the following structure:
{
  "paper": {
    "title": "${paperMetadata.title.replace(/"/g, '\\"')}",
    "authors": ${JSON.stringify(paperMetadata.authors)},
    "source": "${paperMetadata.paperId?.startsWith('arxiv:') ? 'arxiv' : paperMetadata.paperId?.startsWith('openreview:') ? 'openreview' : 'pdf'}",
    "id": "${paperMetadata.paperId || 'paper-id'}"
  },
  "summaryBullets": ["bullet 1", "bullet 2", ...], // 5-8 bullets
  "keyClaims": [
    {
      "claim": "claim text",
      "evidence": [{"chunkId": "...", "quote": "...", "location": {...}}]
    }
  ], // 3-7 claims
  "questions": [
    {
      "question": "question text",
      "evidence": [{"chunkId": "...", "quote": "...", "location": {...}}]
    }
  ], // 5-12 questions
  "missingAblations": [
    {
      "description": "description",
      "suggestedExperiment": "experiment",
      "evidence": [{"chunkId": "...", "quote": "...", "location": {...}}]
    }
  ], // 3-10 items
  "potentialIssues": [
    {
      "issue": "issue description",
      "severity": "Low|Med|High",
      "confidence": 0.0-1.0,
      "evidence": [{"chunkId": "...", "quote": "...", "location": {...}}],
      "suggestedCheck": "what to check"
    }
  ], // 3-10 items
  "replicationChecklist": ["item 1", "item 2", ...], // 5-12 items
  "nextWeekTests": ["test 1", "test 2", ...], // 2-5 items
  "modelMeta": {
    "provider": "openai",
    "model": "gpt-4",
    "timestamp": ${Date.now()}
  }
}

IMPORTANT: Every critique item MUST include at least one evidence span with chunkId, quote, and location.`;
}
