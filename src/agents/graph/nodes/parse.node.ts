import { Logger } from '@nestjs/common';
import { MigrationState } from '../migration-state';
import { ParseRepositoryUseCase } from '../../../application/use-cases/parse-repository.use-case';

const logger = new Logger('ParseNode');

export async function parseNode(
  state: MigrationState,
  useCase: ParseRepositoryUseCase,
): Promise<Partial<MigrationState>> {
  if (!state.manifest) {
    return { errors: [...state.errors, 'Parse: missing manifest'], currentStage: 'output' };
  }

  state.onProgress?.('parse', `Parsing ${state.manifest.totalFiles} files...`);
  logger.log(`Parsing repository: ${state.manifest.repoName}`);

  try {
    const analysis = await useCase.execute(state.manifest);
    const errorCount = analysis.filesWithErrors.length;

    if (errorCount > 0) {
      logger.warn(`${errorCount} files failed to parse — will use LLM fallback for those`);
    }

    state.onProgress?.('parse', `Parsed ${analysis.successfullyParsedFiles.length} files. Found ${analysis.allBusinessRules.length} business rules, ${analysis.allDataModels.length} data models.`);

    return { analysis, currentStage: 'index' };
  } catch (err: any) {
    logger.error(`Parse failed: ${err.message}`);
    return { errors: [...state.errors, `Parse: ${err.message}`], currentStage: 'output' };
  }
}
