export interface IEmbeddingProvider {
  /** Embed a single text string */
  embed(text: string): Promise<number[]>;
  /** Embed multiple texts in batch — more efficient than calling embed() in a loop */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** Dimension size of the embeddings produced */
  readonly dimensions: number;
}

export const EMBEDDING_PROVIDER_TOKEN = 'EMBEDDING_PROVIDER';
