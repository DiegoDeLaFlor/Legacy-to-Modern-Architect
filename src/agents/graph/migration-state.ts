import { RepoManifest } from '../../domain/entities/repo-manifest.entity';
import { RepositoryAnalysis } from '../../domain/entities/repository-analysis.entity';
import { MigrationPlan } from '../../domain/entities/migration-plan.entity';
import { GeneratedCodebase } from '../../domain/entities/generated-codebase.entity';
import { ReviewFinding } from '../../domain/entities/review-finding.entity';
import { MigrationResult } from '../../domain/entities/migration-result.entity';

export type PipelineStage =
  | 'ingest'
  | 'parse'
  | 'index'
  | 'plan'
  | 'generate'
  | 'review'
  | 'output'
  | 'done';

export interface MigrationState {
  // Input
  repoSource: string;
  outputPath: string;

  // Stage outputs
  manifest: RepoManifest | null;
  analysis: RepositoryAnalysis | null;
  indexingComplete: boolean;
  plan: MigrationPlan | null;
  generatedCode: GeneratedCodebase | null;
  reviewFindings: ReviewFinding[];

  // Control flow
  currentStage: PipelineStage;
  retryCount: number;
  maxRetries: number;
  startedAt: number; // Date.now()
  errors: string[];

  // Progress event emitter (optional — used by API/CLI progress reporting)
  onProgress?: (stage: PipelineStage, message: string) => void;

  // Output
  result: MigrationResult | null;
}

export function createInitialState(
  repoSource: string,
  outputPath: string,
  maxRetries = 3,
  onProgress?: MigrationState['onProgress'],
): MigrationState {
  return {
    repoSource,
    outputPath,
    manifest: null,
    analysis: null,
    indexingComplete: false,
    plan: null,
    generatedCode: null,
    reviewFindings: [],
    currentStage: 'ingest',
    retryCount: 0,
    maxRetries,
    startedAt: Date.now(),
    errors: [],
    onProgress,
    result: null,
  };
}
