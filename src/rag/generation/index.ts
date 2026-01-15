import OpenAI from 'openai';
import { AnalysisSchema, type Analysis } from '@/schemas';
import type { Chunk } from '@/schemas';
import { buildAnalysisPrompt, type AnalysisOptions } from './prompt';

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

export class OpenAILLMProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: LLMConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key required');
    }
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'gpt-5.2';
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

// buildAnalysisPrompt moved to prompt.ts
