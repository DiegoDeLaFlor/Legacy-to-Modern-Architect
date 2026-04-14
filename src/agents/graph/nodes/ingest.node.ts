import { Logger } from '@nestjs/common';
import { MigrationState } from '../migration-state';
import { IngestRepositoryUseCase } from '../../../application/use-cases/ingest-repository.use-case';

const logger = new Logger('IngestNode');

export async function ingestNode(
  state: MigrationState,
  useCase: IngestRepositoryUseCase,
): Promise<Partial<MigrationState>> {
  state.onProgress?.('ingest', `Ingesting repository: ${state.repoSource}`);
  logger.log(`Ingesting: ${state.repoSource}`);

  try {
    const manifest = await useCase.execute(state.repoSource);

    logger.log(
      `Manifest ready — ${manifest.totalFiles} files, ~${manifest.estimatedTotalTokens.toLocaleString()} tokens, ` +
      `estimated cost: $${(manifest.estimatedEmbeddingCostUsd + manifest.estimatedAnalysisCostUsd).toFixed(2)}`,
    );

    state.onProgress?.('ingest', `Found ${manifest.totalFiles} files. Primary language: ${manifest.primaryLanguage}`);

    return { manifest, currentStage: 'parse' };
  } catch (err: any) {
    logger.error(`Ingest failed: ${err.message}`);
    return { errors: [...state.errors, `Ingest: ${err.message}`], currentStage: 'output' };
  }
}
