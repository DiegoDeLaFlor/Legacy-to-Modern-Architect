import { Injectable, Inject } from '@nestjs/common';
import { MigrationState, createInitialState, PipelineStage } from './migration-state';
import { MigrationResult, MigrationStatus } from '../../domain/entities/migration-result.entity';
import { ILlmProvider, LLM_PROVIDER_TOKEN } from '../../domain/ports/llm-provider.port';
import { IVectorStore, VECTOR_STORE_TOKEN } from '../../domain/ports/vector-store.port';
import { IEmbeddingProvider, EMBEDDING_PROVIDER_TOKEN } from '../../domain/ports/embedding-provider.port';
import { PromptBuilderService } from '../../application/services/prompt-builder.service';
import { IngestRepositoryUseCase } from '../../application/use-cases/ingest-repository.use-case';
import { ParseRepositoryUseCase } from '../../application/use-cases/parse-repository.use-case';
import { IndexRepositoryUseCase } from '../../application/use-cases/index-repository.use-case';
import { ingestNode } from './nodes/ingest.node';
import { parseNode } from './nodes/parse.node';
import { indexNode } from './nodes/index.node';
import { planNode } from './nodes/plan.node';
import { generateNode } from './nodes/generate.node';
import { reviewNode } from './nodes/review.node';
import { reviewRouter } from './edges/review-router.edge';

@Injectable()
export class MigrationGraph {
  constructor(
    private readonly ingestUseCase: IngestRepositoryUseCase,
    private readonly parseUseCase: ParseRepositoryUseCase,
    private readonly indexUseCase: IndexRepositoryUseCase,
    private readonly promptBuilder: PromptBuilderService,
    @Inject(LLM_PROVIDER_TOKEN) private readonly llm: ILlmProvider,
    @Inject(VECTOR_STORE_TOKEN) private readonly vectorStore: IVectorStore,
    @Inject(EMBEDDING_PROVIDER_TOKEN) private readonly embedder: IEmbeddingProvider,
  ) {}

  async run(
    repoSource: string,
    outputPath: string,
    maxRetries = 3,
    onProgress?: MigrationState['onProgress'],
  ): Promise<MigrationResult> {
    let state = createInitialState(repoSource, outputPath, maxRetries, onProgress);

    // Execute pipeline stages
    state = await this.step(state, 'ingest');
    if (state.currentStage !== 'output') state = await this.step(state, 'parse');
    if (state.currentStage !== 'output') state = await this.step(state, 'index');
    if (state.currentStage !== 'output') state = await this.step(state, 'plan');

    // Generate → Review loop
    while (state.currentStage === 'generate' || state.currentStage === 'plan') {
      if (state.currentStage === 'plan') {
        // shouldn't happen after first pass, but guard
        break;
      }
      state = await this.step(state, 'generate');
      state = await this.step(state, 'review');

      const route = reviewRouter(state);
      if (route === 'retry') {
        state = { ...state, retryCount: state.retryCount + 1, currentStage: 'generate' };
        onProgress?.('generate', `Retry ${state.retryCount}/${state.maxRetries} — fixing critical issues...`);
      } else {
        state = { ...state, currentStage: 'output' };
      }
    }

    return this.buildResult(state);
  }

  private async step(state: MigrationState, stage: PipelineStage): Promise<MigrationState> {
    let patch: Partial<MigrationState>;

    switch (stage) {
      case 'ingest':
        patch = await ingestNode(state, this.ingestUseCase);
        break;
      case 'parse':
        patch = await parseNode(state, this.parseUseCase);
        break;
      case 'index':
        patch = await indexNode(state, this.indexUseCase);
        break;
      case 'plan':
        patch = await planNode(state, this.llm, this.vectorStore, this.embedder, this.promptBuilder);
        break;
      case 'generate':
        patch = await generateNode(state, this.llm, this.vectorStore, this.embedder, this.promptBuilder);
        break;
      case 'review':
        patch = await reviewNode(state, this.llm);
        break;
      default:
        patch = {};
    }

    return { ...state, ...patch };
  }

  private buildResult(state: MigrationState): MigrationResult {
    const criticals = state.reviewFindings.filter((f) => f.isCritical).length;
    const status: MigrationStatus =
      state.errors.length > 0 && !state.generatedCode
        ? 'failed'
        : criticals > 0
        ? 'partial'
        : state.reviewFindings.length > 0
        ? 'success_with_warnings'
        : 'success';

    return new MigrationResult(
      state.manifest?.repoId ?? 'unknown',
      status,
      state.plan!,
      state.generatedCode!,
      state.reviewFindings,
      state.outputPath,
      new Date(),
      Date.now() - state.startedAt,
    );
  }
}
