import { GeneratedCodebase } from './generated-codebase.entity';
import { ReviewFinding } from './review-finding.entity';
import { MigrationPlan } from './migration-plan.entity';

export type MigrationStatus = 'success' | 'success_with_warnings' | 'partial' | 'failed';

export class MigrationResult {
  constructor(
    public readonly repoId: string,
    public readonly status: MigrationStatus,
    public readonly plan: MigrationPlan,
    public readonly codebase: GeneratedCodebase,
    public readonly findings: ReviewFinding[],
    public readonly outputPath: string,
    public readonly completedAt: Date,
    public readonly durationMs: number,
  ) {}

  get criticalFindings(): ReviewFinding[] {
    return this.findings.filter((f) => f.isCritical);
  }

  get qualityReport(): string {
    const counts = {
      critical: this.findings.filter((f) => f.severity === 'critical').length,
      warning: this.findings.filter((f) => f.severity === 'warning').length,
      info: this.findings.filter((f) => f.severity === 'info').length,
    };
    return [
      `Migration Status: ${this.status}`,
      `Files Generated: ${this.codebase.files.length}`,
      `Modules: ${this.plan.nestModules.length} Nest.js + ${this.plan.angularFeatures.length} Angular`,
      `Findings: ${counts.critical} critical, ${counts.warning} warnings, ${counts.info} info`,
      `Duration: ${(this.durationMs / 1000).toFixed(1)}s`,
    ].join('\n');
  }
}
