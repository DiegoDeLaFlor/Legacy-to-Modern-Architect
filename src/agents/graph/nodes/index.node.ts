import { Logger } from '@nestjs/common';
import { MigrationState } from '../migration-state';
import { IndexRepositoryUseCase } from '../../../application/use-cases/index-repository.use-case';

const logger = new Logger('IndexNode');

export async function indexNode(
  state: MigrationState,
  useCase: IndexRepositoryUseCase,
): Promise<Partial<MigrationState>> {
  if (!state.analysis) {
    return { errors: [...state.errors, 'Index: missing analysis'], currentStage: 'output' };
  }

  state.onProgress?.('index', 'Indexing repository into vector store (Tier 1)...');
  logger.log('Indexing Tier 1 files into pgvector');

  try {
    // Tier 1 only on first pass — speeds up large repos
    await useCase.execute(state.analysis, true);
    state.onProgress?.('index', 'Vector index ready. Starting architecture planning...');

    return { indexingComplete: true, currentStage: 'plan' };
  } catch (err: any) {
    logger.error(`Indexing failed: ${err.message}`);
    return { errors: [...state.errors, `Index: ${err.message}`], currentStage: 'output' };
  }
}
