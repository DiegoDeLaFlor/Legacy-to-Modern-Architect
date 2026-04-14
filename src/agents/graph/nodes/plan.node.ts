import { Logger } from '@nestjs/common';
import { MigrationState } from '../migration-state';
import { ILlmProvider } from '../../../domain/ports/llm-provider.port';
import { IVectorStore } from '../../../domain/ports/vector-store.port';
import { IEmbeddingProvider } from '../../../domain/ports/embedding-provider.port';
import { MigrationPlan, NestModulePlan, AngularFeaturePlan } from '../../../domain/entities/migration-plan.entity';
import { ModuleBoundary } from '../../../domain/value-objects/module-boundary.vo';
import { PromptBuilderService } from '../../../application/services/prompt-builder.service';
import { PLANNER_SYSTEM_PROMPT, buildPlannerUserPrompt } from '../../prompts/planner.prompts';

const logger = new Logger('PlanNode');

export async function planNode(
  state: MigrationState,
  llm: ILlmProvider,
  vectorStore: IVectorStore,
  embedder: IEmbeddingProvider,
  promptBuilder: PromptBuilderService,
): Promise<Partial<MigrationState>> {
  if (!state.analysis) {
    return { errors: [...state.errors, 'Plan: missing analysis'], currentStage: 'output' };
  }

  state.onProgress?.('plan', 'Architecture Planner agent is analyzing the codebase...');
  logger.log('Starting architecture planning');

  const { analysis } = state;
  const { manifest } = analysis;

  // Build repo summary for context
  const repoSummary = buildRepoSummary(analysis);

  // RAG: query for high-level structure — summaries, data models, entry points
  const queryText = `main entry points, data models, entities, services, controllers, repositories`;
  let ragContext = '';
  try {
    const queryEmbedding = await embedder.embed(queryText);
    const results = await vectorStore.search(manifest.repoId, queryEmbedding, {
      limit: 30,
      metadataFilter: { type: 'summary' } as any,
    });
    const codeResults = await vectorStore.search(manifest.repoId, queryEmbedding, {
      limit: 20,
      metadataFilter: { type: 'dependency' } as any,
    });
    ragContext = promptBuilder.buildContext([...results, ...codeResults], 8000);
  } catch (err: any) {
    logger.warn(`RAG query failed, proceeding without context: ${err.message}`);
  }

  try {
    const userMessage = buildPlannerUserPrompt(repoSummary, ragContext);

    const response = await llm.call(
      [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      { jsonMode: true, temperature: 0.2, maxTokens: 6000 },
    );

    const parsed = JSON.parse(response);
    const plan = parsePlanFromLlmResponse(parsed, manifest.repoId);

    state.onProgress?.('plan', `Plan complete: ${plan.nestModules.length} Nest.js modules, ${plan.angularFeatures.length} Angular features`);
    logger.log(`Plan created: ${plan.nestModules.length} modules`);

    return { plan, currentStage: 'generate' };
  } catch (err: any) {
    logger.error(`Planning failed: ${err.message}`);
    return { errors: [...state.errors, `Plan: ${err.message}`], currentStage: 'output' };
  }
}

function buildRepoSummary(analysis: ReturnType<typeof Object.assign> & { manifest: any; files: any[] }): string {
  const { manifest } = analysis;
  const lines = [
    `Repository: ${manifest.repoName}`,
    `Primary Language: ${manifest.primaryLanguage}`,
    `Total Files: ${manifest.totalFiles}`,
    `Business Rules Found: ${analysis.allBusinessRules?.length ?? 0}`,
    `Data Models Found: ${analysis.allDataModels?.length ?? 0}`,
    '',
    'Data Models:',
    ...(analysis.allDataModels?.slice(0, 20).map((m: any) => `  - ${m.name} (${m.isEntity ? 'entity' : 'model'}) in ${m.filePath}`) ?? []),
    '',
    'Top Business Rules:',
    ...(analysis.allBusinessRules?.slice(0, 20).map((r: any) => `  - ${r.name} [${r.category}] in ${r.filePath}`) ?? []),
  ];
  return lines.join('\n');
}

function parsePlanFromLlmResponse(raw: any, repoId: string): MigrationPlan {
  const nestModules: NestModulePlan[] = (raw.nestModules ?? []).map((m: any) => ({
    name: m.name,
    description: m.description ?? '',
    boundary: {
      name: m.name,
      sourcePaths: m.boundary?.sourcePaths ?? m.legacySourcePaths ?? [],
      dependencies: m.dependsOn ?? [],
      concepts: m.concepts ?? [],
    } as ModuleBoundary,
    entities: m.entities ?? [],
    useCases: m.useCases ?? [],
    controller: m.controller,
    endpoints: m.endpoints ?? [],
    dependsOn: m.dependsOn ?? [],
    legacySourcePaths: m.legacySourcePaths ?? [],
  }));

  const angularFeatures: AngularFeaturePlan[] = (raw.angularFeatures ?? []).map((f: any) => ({
    name: f.name,
    description: f.description ?? '',
    components: f.components ?? [],
    services: f.services ?? [],
    backendModules: f.backendModules ?? [],
    routes: f.routes ?? [],
  }));

  return new MigrationPlan(
    repoId,
    nestModules,
    angularFeatures,
    raw.globalEntities ?? [],
    new Date(),
    raw.plannerReasoning ?? '',
  );
}
