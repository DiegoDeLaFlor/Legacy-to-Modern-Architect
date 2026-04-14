import { ChunkMetadata } from '../value-objects/chunk-metadata.vo';

export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: ChunkMetadata;
}

export interface VectorSearchResult {
  document: VectorDocument;
  score: number;
}

export interface VectorSearchOptions {
  limit?: number;
  metadataFilter?: Partial<ChunkMetadata>;
  /** Minimum similarity score (0–1) */
  minScore?: number;
}

export interface IVectorStore {
  /** Initialize/ensure the collection for a given repo exists */
  initCollection(repoId: string, dimensions: number): Promise<void>;
  /** Insert documents in batch */
  upsertBatch(repoId: string, documents: VectorDocument[]): Promise<void>;
  /** Semantic search by embedding */
  search(repoId: string, queryEmbedding: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
  /** Keyword search (full-text) */
  keywordSearch(repoId: string, query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
  /** Delete entire collection for a repo */
  dropCollection(repoId: string): Promise<void>;
}

export const VECTOR_STORE_TOKEN = 'VECTOR_STORE';
