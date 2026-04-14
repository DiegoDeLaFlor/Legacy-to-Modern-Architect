import { Logger } from '@nestjs/common';
import { MigrationState } from '../migration-state';
import { ILlmProvider } from '../../../domain/ports/llm-provider.port';
import { ReviewFinding } from '../../../domain/entities/review-finding.entity';
import { GeneratedFile } from '../../../domain/entities/generated-codebase.entity';

const logger = new Logger('ReviewNode');

export async function reviewNode(
  state: MigrationState,
  llm: ILlmProvider,
): Promise<Partial<MigrationState>> {
  if (!state.generatedCode || !state.plan) {
    return { errors: [...state.errors, 'Review: missing generated code'], currentStage: 'output' };
  }

  state.onProgress?.('review', 'Code Reviewer agent is validating the generated codebase...');
  logger.log('Starting code review');

  const findings: ReviewFinding[] = [];

  // Pass 1: Structural validation (deterministic)
  findings.push(...validateStructure(state.generatedCode.files, state.plan.nestModules.map((m) => m.name)));

  // Pass 2: Pattern compliance (LLM) — sample files
  const patternFindings = await validatePatterns(state.generatedCode.files, llm);
  findings.push(...patternFindings);

  // Pass 3: Business logic coverage (LLM)
  if (state.analysis) {
    const bizRules = state.analysis.allBusinessRules.slice(0, 10); // sample top 10
    if (bizRules.length > 0) {
      const coverageFindings = await validateBusinessLogicCoverage(bizRules, state.generatedCode.files, llm);
      findings.push(...coverageFindings);
    }
  }

  const criticalCount = findings.filter((f) => f.isCritical).length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;

  logger.log(`Review complete: ${criticalCount} critical, ${warningCount} warnings`);
  state.onProgress?.('review', `Review: ${criticalCount} critical issues, ${warningCount} warnings`);

  return { reviewFindings: findings, currentStage: 'output' };
}

function validateStructure(files: GeneratedFile[], plannedModules: string[]): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const generatedModules = new Set(files.map((f) => f.moduleName));

  for (const planned of plannedModules) {
    if (!generatedModules.has(planned)) {
      findings.push(new ReviewFinding(
        'critical',
        'structure',
        `Module "${planned}" was planned but no files were generated for it.`,
        planned,
        undefined,
        'Re-run code generation for this module',
      ));
    }
  }

  for (const mod of generatedModules) {
    const modFiles = files.filter((f) => f.moduleName === mod);
    const hasDomain = modFiles.some((f) => f.relativePath.includes('/domain/') || f.relativePath.includes('.entity.ts'));
    const hasModule = modFiles.some((f) => f.relativePath.endsWith('.module.ts'));

    if (!hasDomain) {
      findings.push(new ReviewFinding('warning', 'structure', `Module "${mod}" is missing domain entities.`, mod));
    }
    if (!hasModule) {
      findings.push(new ReviewFinding('warning', 'structure', `Module "${mod}" is missing a .module.ts file.`, mod));
    }
  }

  return findings;
}

async function validatePatterns(files: GeneratedFile[], llm: ILlmProvider): Promise<ReviewFinding[]> {
  // Sample up to 5 controller + use-case files for pattern review
  const sample = files
    .filter((f) => f.relativePath.includes('controller') || f.relativePath.includes('use-case'))
    .slice(0, 5);

  if (sample.length === 0) return [];

  const sampleText = sample
    .map((f) => `// File: ${f.relativePath}\n${f.content.slice(0, 800)}`)
    .join('\n\n---\n\n');

  try {
    const response = await llm.call(
      [
        {
          role: 'system',
          content: 'You are a Clean Architecture reviewer. Analyze the given code samples and return a JSON array of findings. Each finding has: { "severity": "critical"|"warning"|"info", "category": "pattern", "filePath": string, "message": string, "moduleName": string }. Return [] if no issues.',
        },
        {
          role: 'user',
          content: `Review these generated files for Clean Architecture compliance, SOLID principles, and Nest.js best practices:\n\n${sampleText}`,
        },
      ],
      { jsonMode: true, temperature: 0 },
    );

    const parsed = JSON.parse(response);
    const rawFindings = Array.isArray(parsed) ? parsed : (parsed.findings ?? []);
    return rawFindings.map(
      (f: any) =>
        new ReviewFinding(
          f.severity ?? 'info',
          f.category ?? 'pattern',
          f.message,
          f.moduleName,
          f.filePath,
          f.suggestion,
        ),
    );
  } catch {
    return [];
  }
}

async function validateBusinessLogicCoverage(
  bizRules: Array<{ name: string; description: string; category: string; filePath: string }>,
  files: GeneratedFile[],
  llm: ILlmProvider,
): Promise<ReviewFinding[]> {
  const rulesText = bizRules
    .map((r) => `- ${r.name} [${r.category}]: ${r.description} (from ${r.filePath})`)
    .join('\n');

  const generatedSummary = files
    .map((f) => `${f.relativePath}: ${f.description}`)
    .join('\n');

  try {
    const response = await llm.call(
      [
        {
          role: 'system',
          content: 'You check if legacy business rules are covered in generated code. Return JSON: { "uncovered": [{ "ruleName": string, "reason": string }] }',
        },
        {
          role: 'user',
          content: `Legacy Business Rules:\n${rulesText}\n\nGenerated Files:\n${generatedSummary}\n\nWhich business rules appear to NOT be covered in the generated code?`,
        },
      ],
      { jsonMode: true, temperature: 0 },
    );

    const parsed = JSON.parse(response);
    return (parsed.uncovered ?? []).map(
      (u: any) =>
        new ReviewFinding(
          'warning',
          'business-logic',
          `Business rule "${u.ruleName}" may not be covered: ${u.reason}`,
          undefined,
          undefined,
          'Add this business rule to the appropriate use case',
        ),
    );
  } catch {
    return [];
  }
}
