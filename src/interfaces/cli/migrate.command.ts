import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AppModule } from '../../app.module';
import { MigrationGraph } from '../../agents/graph/migration-graph';
import { FileWriterAdapter } from '../../infrastructure/filesystem/file-writer.adapter';
import { PipelineStage } from '../../agents/graph/migration-state';

export function registerMigrateCommand(program: Command): void {
  program
    .command('migrate <source>')
    .description('Migrate a legacy repository to Clean Architecture Nest.js + Angular')
    .option('-o, --output <dir>', 'Output directory', './output')
    .option('-r, --retries <number>', 'Max review retries', '3')
    .option('--no-progress', 'Disable progress output')
    .action(async (source: string, options: { output: string; retries: string; progress: boolean }) => {
      const outputPath = path.resolve(options.output);
      const maxRetries = parseInt(options.retries, 10);

      console.log(`\n🏗  Legacy-to-Modern Architect`);
      console.log(`   Source: ${source}`);
      console.log(`   Output: ${outputPath}`);
      console.log(`   Max retries: ${maxRetries}\n`);

      const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
      });

      const graph = app.get(MigrationGraph);
      const fileWriter = app.get(FileWriterAdapter);

      const onProgress = options.progress
        ? (stage: PipelineStage, message: string) => {
            const icons: Record<PipelineStage, string> = {
              ingest: '📥', parse: '🔍', index: '🗂 ', plan: '🏛 ',
              generate: '⚙️ ', review: '✅', output: '📦', done: '🎉',
            };
            console.log(`  ${icons[stage] ?? '▶'} [${stage.toUpperCase()}] ${message}`);
          }
        : undefined;

      try {
        const result = await graph.run(source, outputPath, maxRetries, onProgress);

        // Write generated files to disk
        if (result.codebase) {
          await fileWriter.writeFiles(outputPath, result.codebase.files);
        }

        console.log(`\n${result.qualityReport}`);
        console.log(`\n✅ Migration complete! Output: ${outputPath}`);

        // Write quality report
        await fs.mkdir(outputPath, { recursive: true });
        await fs.writeFile(
          path.join(outputPath, 'MIGRATION_REPORT.md'),
          buildMarkdownReport(result),
          'utf-8',
        );
      } catch (err: any) {
        console.error(`\n❌ Migration failed: ${err.message}`);
        process.exit(1);
      } finally {
        await app.close();
      }
    });
}

function buildMarkdownReport(result: any): string {
  return [
    `# Migration Report`,
    ``,
    `**Status**: ${result.status}`,
    `**Generated Files**: ${result.codebase?.files.length ?? 0}`,
    `**Modules**: ${result.plan?.nestModules.length ?? 0} Nest.js + ${result.plan?.angularFeatures.length ?? 0} Angular`,
    `**Duration**: ${(result.durationMs / 1000).toFixed(1)}s`,
    ``,
    `## Findings`,
    ...result.findings.map((f: any) => `- **[${f.severity}]** ${f.message}${f.suggestion ? ` → ${f.suggestion}` : ''}`),
    ``,
    `## Generated Modules`,
    ...(result.plan?.nestModules?.map((m: any) => `- **${m.name}**: ${m.description}`) ?? []),
  ].join('\n');
}
