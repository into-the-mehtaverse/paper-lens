import Dexie, { type Table } from 'dexie';
import type {
  PaperMetadata,
  Chunk,
  Embedding,
  StoredAnalysis,
  PaperLink,
} from '@/schemas';

export class PaperLensDB extends Dexie {
  papers!: Table<PaperMetadata, string>;
  chunks!: Table<Chunk, [string, string]>; // [paperId, chunkId]
  embeddings!: Table<Embedding, [string, string]>; // [paperId, chunkId]
  analyses!: Table<StoredAnalysis, [string, string]>; // [paperId, analysisVersion]
  links!: Table<PaperLink, number>;

  constructor() {
    super('PaperLensDB');

    this.version(1).stores({
      papers: 'paperId',
      chunks: '[paperId+chunkId]',
      embeddings: '[paperId+chunkId]',
      analyses: '[paperId+analysisVersion]',
      links: '++id, fromPaperId, toPaperId',
    });
  }
}

export const db = new PaperLensDB();

// Helper functions
export async function savePaper(metadata: PaperMetadata): Promise<void> {
  await db.papers.put(metadata);
}

export async function getPaper(paperId: string): Promise<PaperMetadata | undefined> {
  return await db.papers.get(paperId);
}

export async function getAllPapers(): Promise<PaperMetadata[]> {
  return await db.papers.toArray();
}

export async function saveChunks(chunks: Chunk[]): Promise<void> {
  await db.chunks.bulkPut(chunks);
}

export async function getChunks(paperId: string): Promise<Chunk[]> {
  return await db.chunks.where('paperId').equals(paperId).toArray();
}

export async function saveEmbeddings(embeddings: Embedding[]): Promise<void> {
  await db.embeddings.bulkPut(embeddings);
}

export async function getEmbeddings(paperId: string): Promise<Embedding[]> {
  return await db.embeddings.where('paperId').equals(paperId).toArray();
}

export async function saveAnalysis(analysis: StoredAnalysis): Promise<void> {
  await db.analyses.put(analysis);
}

export async function getAnalysis(
  paperId: string,
  version: string = '1.0.0'
): Promise<StoredAnalysis | undefined> {
  return await db.analyses.get([paperId, version]);
}

export async function saveLink(link: PaperLink): Promise<number> {
  return await db.links.add(link);
}

export async function getLinks(paperId: string): Promise<PaperLink[]> {
  return await db.links
    .where('fromPaperId')
    .equals(paperId)
    .or('toPaperId')
    .equals(paperId)
    .toArray();
}

export async function deletePaper(paperId: string): Promise<void> {
  await db.transaction('rw', db.papers, db.chunks, db.embeddings, db.analyses, async () => {
    await db.papers.delete(paperId);
    await db.chunks.where('paperId').equals(paperId).delete();
    await db.embeddings.where('paperId').equals(paperId).delete();
    await db.analyses.where('paperId').equals(paperId).delete();
  });
}

export async function clearAll(): Promise<void> {
  // Dexie 4 limits transaction to 6 stores, so we do it in two transactions
  await db.transaction('rw', db.papers, db.chunks, db.embeddings, db.analyses, async () => {
    await db.papers.clear();
    await db.chunks.clear();
    await db.embeddings.clear();
    await db.analyses.clear();
  });
  await db.transaction('rw', db.links, async () => {
    await db.links.clear();
  });
}
