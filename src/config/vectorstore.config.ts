export interface VectorStoreConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  embeddingDimensions: number;
}

export function loadVectorStoreConfig(): VectorStoreConfig {
  return {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    database: process.env.POSTGRES_DB ?? 'legacy_architect',
    user: process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD ?? 'postgres',
    embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS ?? '1536', 10),
  };
}
