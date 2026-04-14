import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { IVectorStore, VectorDocument, VectorSearchResult, VectorSearchOptions } from '../../domain/ports/vector-store.port';
import { ChunkMetadata } from '../../domain/value-objects/chunk-metadata.vo';
import { loadVectorStoreConfig } from '../../config/vectorstore.config';

@Injectable()
export class PgVectorAdapter implements IVectorStore, OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor() {
    const config = loadVectorStoreConfig();
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
    });
  }

  async onModuleInit(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private tableName(repoId: string): string {
    const safe = repoId.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    return `embeddings_${safe}`;
  }

  async initCollection(repoId: string, dimensions: number): Promise<void> {
    const table = this.tableName(repoId);
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          embedding vector(${dimensions}),
          metadata JSONB NOT NULL,
          content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${table}_embedding_idx
        ON ${table} USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${table}_tsv_idx
        ON ${table} USING GIN (content_tsv)
      `);
    } finally {
      client.release();
    }
  }

  async upsertBatch(repoId: string, documents: VectorDocument[]): Promise<void> {
    const table = this.tableName(repoId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const doc of documents) {
        const vectorLiteral = `[${doc.embedding.join(',')}]`;
        await client.query(
          `INSERT INTO ${table} (id, content, embedding, metadata)
           VALUES ($1, $2, $3::vector, $4)
           ON CONFLICT (id) DO UPDATE
             SET content = EXCLUDED.content,
                 embedding = EXCLUDED.embedding,
                 metadata = EXCLUDED.metadata`,
          [doc.id, doc.content, vectorLiteral, JSON.stringify(doc.metadata)],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async search(
    repoId: string,
    queryEmbedding: number[],
    options?: VectorSearchOptions,
  ): Promise<VectorSearchResult[]> {
    const table = this.tableName(repoId);
    const limit = options?.limit ?? 10;
    const minScore = options?.minScore ?? 0;
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    const whereClause = this.buildMetadataWhere(options?.metadataFilter);
    const query = `
      SELECT id, content, metadata,
             1 - (embedding <=> $1::vector) AS score
      FROM ${table}
      ${whereClause.sql}
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;

    const client = await this.pool.connect();
    try {
      const result = await client.query(query, [vectorLiteral, limit, ...whereClause.params]);
      return result.rows
        .filter((r) => parseFloat(r.score) >= minScore)
        .map((r) => ({
          document: {
            id: r.id,
            content: r.content,
            embedding: [],
            metadata: r.metadata as ChunkMetadata,
          },
          score: parseFloat(r.score),
        }));
    } finally {
      client.release();
    }
  }

  async keywordSearch(
    repoId: string,
    query: string,
    options?: VectorSearchOptions,
  ): Promise<VectorSearchResult[]> {
    const table = this.tableName(repoId);
    const limit = options?.limit ?? 10;
    const whereClause = this.buildMetadataWhere(options?.metadataFilter);
    const tsQuery = query.trim().split(/\s+/).join(' & ');

    const sql = `
      SELECT id, content, metadata,
             ts_rank(content_tsv, to_tsquery('english', $1)) AS score
      FROM ${table}
      ${whereClause.sql}
        ${whereClause.sql ? 'AND' : 'WHERE'} content_tsv @@ to_tsquery('english', $1)
      ORDER BY score DESC
      LIMIT $2
    `;

    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, [tsQuery, limit, ...whereClause.params]);
      return result.rows.map((r) => ({
        document: {
          id: r.id,
          content: r.content,
          embedding: [],
          metadata: r.metadata as ChunkMetadata,
        },
        score: parseFloat(r.score),
      }));
    } finally {
      client.release();
    }
  }

  async dropCollection(repoId: string): Promise<void> {
    const table = this.tableName(repoId);
    const client = await this.pool.connect();
    try {
      await client.query(`DROP TABLE IF EXISTS ${table}`);
    } finally {
      client.release();
    }
  }

  private buildMetadataWhere(filter?: Partial<ChunkMetadata>): { sql: string; params: unknown[] } {
    if (!filter || Object.keys(filter).length === 0) return { sql: '', params: [] };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 3; // $1 = vector/tsquery, $2 = limit

    for (const [key, value] of Object.entries(filter)) {
      if (value !== undefined) {
        conditions.push(`metadata->>'${key}' = $${paramIdx}`);
        params.push(value);
        paramIdx++;
      }
    }

    return {
      sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }
}
