import { Injectable, Inject, Logger } from '@nestjs/common';
import { RepositoryAnalysis } from '../../domain/entities/repository-analysis.entity';
import { IVectorStore, VECTOR_STORE_TOKEN, VectorDocument } from '../../domain/ports/vector-store.port';
import { IEmbeddingProvider, EMBEDDING_PROVIDER_TOKEN } from '../../domain/ports/embedding-provider.port';
import { ChunkingService, CodeChunk } from '../services/chunking.service';

/** How many chunks to embed+insert per batch */
const INDEX_BATCH_SIZE = 64;

/** Number of top-centrality files to index in Tier 1 */
const TIER1_FILE_COUNT = 50;

@Injectable()
export class IndexRepositoryUseCase {
  private readonly logger = new Logger(IndexRepositoryUseCase.name);

  constructor(
    private readonly chunker: ChunkingService,
    @Inject(VECTOR_STORE_TOKEN) private readonly vectorStore: IVectorStore,
    @Inject(EMBEDDING_PROVIDER_TOKEN) private readonly embedder: IEmbeddingProvider,
  ) {}

  async execute(analysis: RepositoryAnalysis, tierOneOnly = false): Promise<void> {
    const { repoId } = analysis.manifest;
    await this.vectorStore.initCollection(repoId, this.embedder.dimensions);

    const filesToIndex = tierOneOnly
      ? this.selectTierOneFiles(analysis)
      : analysis.successfullyParsedFiles;

    this.logger.log(`Indexing ${filesToIndex.length} files (tierOneOnly=${tierOneOnly})`);

    // Collect all chunks
    const allChunks: CodeChunk[] = [];
    for (const file of filesToIndex) {
      const chunks = this.chunker.chunkFile(file, repoId);
      allChunks.push(...chunks);
    }

    this.logger.log(`Embedding ${allChunks.length} chunks in batches of ${INDEX_BATCH_SIZE}`);

    // Batch embed + upsert
    for (let i = 0; i < allChunks.length; i += INDEX_BATCH_SIZE) {
      const batch = allChunks.slice(i, i + INDEX_BATCH_SIZE);
      const texts = batch.map((c) => c.content);

      const embeddings = await this.embedder.embedBatch(texts);

      const documents: VectorDocument[] = batch.map((chunk, idx) => ({
        id: chunk.id,
        content: chunk.content,
        embedding: embeddings[idx],
        metadata: chunk.metadata,
      }));

      await this.vectorStore.upsertBatch(repoId, documents);
      this.logger.debug(`Indexed batch ${Math.floor(i / INDEX_BATCH_SIZE) + 1}/${Math.ceil(allChunks.length / INDEX_BATCH_SIZE)}`);
    }

    this.logger.log(`Indexing complete for repo ${repoId}`);
  }

  private selectTierOneFiles(analysis: RepositoryAnalysis) {
    const graph = analysis.dependencyGraph;
    const topNodes = graph.getTopCentralNodes(TIER1_FILE_COUNT);
    const tier1Paths = new Set(topNodes.map((n) => n.filePath));

    // Also include all data models and entry points regardless of centrality
    const dataModelFiles = analysis.files.filter((f) => f.dataModels.length > 0);
    for (const f of dataModelFiles) tier1Paths.add(f.filePath);

    return analysis.successfullyParsedFiles.filter((f) => tier1Paths.has(f.filePath));
  }
}
