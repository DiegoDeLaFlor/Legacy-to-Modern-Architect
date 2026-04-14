import { Logger } from '@nestjs/common';
import { MigrationState } from '../migration-state';
import { ILlmProvider } from '../../../domain/ports/llm-provider.port';
import { IVectorStore } from '../../../domain/ports/vector-store.port';
import { IEmbeddingProvider } from '../../../domain/ports/embedding-provider.port';
import { GeneratedCodebase, GeneratedFile } from '../../../domain/entities/generated-codebase.entity';
import { NestModulePlan } from '../../../domain/entities/migration-plan.entity';
import { PromptBuilderService } from '../../../application/services/prompt-builder.service';
import { GENERATOR_SYSTEM_PROMPT, buildGeneratorUserPrompt } from '../../prompts/generator.prompts';

const logger = new Logger('GenerateNode');

export async function generateNode(
  state: MigrationState,
  llm: ILlmProvider,
  vectorStore: IVectorStore,
  embedder: IEmbeddingProvider,
  promptBuilder: PromptBuilderService,
): Promise<Partial<MigrationState>> {
  if (!state.plan || !state.analysis) {
    return { errors: [...state.errors, 'Generate: missing plan or analysis'], currentStage: 'output' };
  }

  const { plan, analysis } = state;
  const repoId = analysis.manifest.repoId;

  const allFiles: GeneratedFile[] = [];
  const contextManifest: Record<string, string[]> = {};

  // Corrections from reviewer (if retry)
  const corrections = state.reviewFindings
    .filter((f) => f.isCritical)
    .map((f) => f.toPromptString())
    .join('\n');

  const orderedModules = plan.modulesInDependencyOrder;
  logger.log(`Generating ${orderedModules.length} modules in dependency order`);

  for (let i = 0; i < orderedModules.length; i++) {
    const mod = orderedModules[i];
    state.onProgress?.('generate', `Generating module ${i + 1}/${orderedModules.length}: ${mod.name}`);
    logger.log(`Generating module: ${mod.name}`);

    // Build module-specific corrections
    const moduleCorrections = state.reviewFindings
      .filter((f) => f.isCritical && f.moduleName === mod.name)
      .map((f) => f.toPromptString())
      .join('\n');

    const legacyContext = await getLegacyContext(
      mod, repoId, vectorStore, embedder, promptBuilder,
    );

    const manifestContext = buildManifestContext(contextManifest, mod.dependsOn);
    const modulePlanText = JSON.stringify(mod, null, 2);

    const userMessage = buildGeneratorUserPrompt(
      modulePlanText,
      legacyContext,
      manifestContext,
      moduleCorrections || corrections,
    );

    try {
      const response = await llm.call(
        [
          { role: 'system', content: GENERATOR_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        { jsonMode: true, temperature: 0.1, maxTokens: 6000 },
      );

      const parsed = JSON.parse(response);
      const generatedFiles: GeneratedFile[] = (parsed.files ?? []).map((f: any) => ({
        relativePath: f.relativePath,
        content: f.content,
        moduleName: mod.name,
        description: f.description ?? '',
      }));

      allFiles.push(...generatedFiles);

      // Update context manifest with exported interfaces from this module
      const exports = extractExportedInterfaces(generatedFiles);
      contextManifest[mod.name] = exports;
    } catch (err: any) {
      logger.error(`Failed to generate module ${mod.name}: ${err.message}`);
      // Non-fatal — continue with other modules
    }
  }

  const generatedCode = new GeneratedCodebase(repoId, allFiles, new Date(), contextManifest);
  state.onProgress?.('generate', `Code generation complete: ${allFiles.length} files across ${generatedCode.moduleNames.length} modules`);

  return { generatedCode, currentStage: 'review', reviewFindings: [] };
}

async function getLegacyContext(
  mod: NestModulePlan,
  repoId: string,
  vectorStore: IVectorStore,
  embedder: IEmbeddingProvider,
  promptBuilder: PromptBuilderService,
): Promise<string> {
  try {
    const queryText = `${mod.name} ${mod.description} ${mod.entities.join(' ')} ${mod.useCases.join(' ')}`;
    const queryEmbedding = await embedder.embed(queryText);

    const [codeResults, ruleResults] = await Promise.all([
      vectorStore.search(repoId, queryEmbedding, {
        limit: 15,
        metadataFilter: { type: 'code' } as any,
      }),
      vectorStore.search(repoId, queryEmbedding, {
        limit: 10,
        metadataFilter: { type: 'business_rule' } as any,
      }),
    ]);

    return promptBuilder.buildContext([...codeResults, ...ruleResults], 6000);
  } catch {
    return '';
  }
}

function buildManifestContext(manifest: Record<string, string[]>, dependsOn: string[]): string {
  if (dependsOn.length === 0) return '';
  const lines: string[] = ['Previously generated module interfaces:'];
  for (const dep of dependsOn) {
    if (manifest[dep]) {
      lines.push(`\n// Module: ${dep}`);
      lines.push(...manifest[dep]);
    }
  }
  return lines.join('\n');
}

function extractExportedInterfaces(files: GeneratedFile[]): string[] {
  const interfaces: string[] = [];
  for (const file of files) {
    if (!file.relativePath.includes('port') && !file.relativePath.includes('entity')) continue;
    // Extract export lines as interface signatures
    const exportLines = file.content
      .split('\n')
      .filter((l) => l.startsWith('export'))
      .slice(0, 10);
    interfaces.push(...exportLines);
  }
  return interfaces;
}
