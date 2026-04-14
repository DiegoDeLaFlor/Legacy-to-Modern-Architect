import { Module } from '@nestjs/common';
import { MigrationGraph } from './graph/migration-graph';
import { LlmModule } from '../infrastructure/llm/llm.module';
import { VectorStoreModule } from '../infrastructure/vectorstore/vectorstore.module';
import { ParsersModule } from '../infrastructure/parsers/parsers.module';
import { PromptBuilderService } from '../application/services/prompt-builder.service';
import { ChunkingService } from '../application/services/chunking.service';
import { IngestRepositoryUseCase } from '../application/use-cases/ingest-repository.use-case';
import { ParseRepositoryUseCase } from '../application/use-cases/parse-repository.use-case';
import { IndexRepositoryUseCase } from '../application/use-cases/index-repository.use-case';
import { REPOSITORY_SOURCE_TOKEN } from '../domain/ports/repository-source.port';
import { GitRepositorySourceAdapter } from '../infrastructure/repository/git-repository-source.adapter';

@Module({
  imports: [LlmModule, VectorStoreModule, ParsersModule],
  providers: [
    // Repository source
    GitRepositorySourceAdapter,
    { provide: REPOSITORY_SOURCE_TOKEN, useExisting: GitRepositorySourceAdapter },

    // Application services
    ChunkingService,
    PromptBuilderService,

    // Use cases
    IngestRepositoryUseCase,
    ParseRepositoryUseCase,
    IndexRepositoryUseCase,

    // Graph orchestrator
    MigrationGraph,
  ],
  exports: [MigrationGraph],
})
export class AgentsModule {}
