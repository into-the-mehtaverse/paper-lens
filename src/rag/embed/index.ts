import OpenAI from 'openai';
import type { Chunk } from '@/schemas';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  apiKey?: string;
  model?: string;
  baseUrl?: string; // For Ollama or custom endpoints
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: EmbeddingConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key required');
    }
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'text-embedding-3-small';
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });
    return response.data.map(item => item.embedding);
  }
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;
  private model: string;

  constructor(config: EmbeddingConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'nomic-embed-text';
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch, so we do sequential
    const embeddings: number[][] = [];
    for (const text of texts) {
      const embedding = await this.embed(text);
      embeddings.push(embedding);
    }
    return embeddings;
  }
}

/**
 * Create embedding provider from config
 */
export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider(config);
    case 'ollama':
      return new OllamaEmbeddingProvider(config);
    case 'anthropic':
      // Anthropic doesn't have embeddings API, fallback to OpenAI
      throw new Error('Anthropic embeddings not supported. Use OpenAI or Ollama.');
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Compute centroid embedding for a set of chunks
 */
export async function computeCentroid(
  chunks: Chunk[],
  provider: EmbeddingProvider
): Promise<number[]> {
  if (chunks.length === 0) {
    throw new Error('Cannot compute centroid of empty chunks');
  }

  const texts = chunks.map(c => c.text);
  const embeddings = await provider.embedBatch(texts);

  // Average the embeddings
  const dimension = embeddings[0].length;
  const centroid = new Array(dimension).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimension; i++) {
      centroid[i] += embedding[i];
    }
  }

  const count = embeddings.length;
  for (let i = 0; i < dimension; i++) {
    centroid[i] /= count;
  }

  return centroid;
}
