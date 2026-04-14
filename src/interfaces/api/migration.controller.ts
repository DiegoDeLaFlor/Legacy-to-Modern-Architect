import { Controller, Post, Body, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { MigrationGraph } from '../../agents/graph/migration-graph';
import { FileWriterAdapter } from '../../infrastructure/filesystem/file-writer.adapter';
import { loadAppConfig } from '../../config/app.config';
import * as path from 'path';

interface StartMigrationDto {
  repoSource: string;
  outputDir?: string;
  maxRetries?: number;
}

@Controller('api/migrations')
export class MigrationController {
  private readonly activeMigrations = new Map<string, { status: string; progress: string[] }>();

  constructor(
    private readonly graph: MigrationGraph,
    private readonly fileWriter: FileWriterAdapter,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async startMigration(@Body() dto: StartMigrationDto) {
    const config = loadAppConfig();
    const migrationId = Date.now().toString();
    const outputPath = path.resolve(dto.outputDir ?? path.join(config.outputDir, migrationId));

    this.activeMigrations.set(migrationId, { status: 'running', progress: [] });

    // Run in background — non-blocking
    this.runMigration(migrationId, dto.repoSource, outputPath, dto.maxRetries ?? 3).catch(
      (err) => {
        const migration = this.activeMigrations.get(migrationId);
        if (migration) {
          migration.status = 'failed';
          migration.progress.push(`Error: ${err.message}`);
        }
      },
    );

    return { migrationId, status: 'started', outputPath };
  }

  @Get(':id')
  getMigrationStatus(@Param('id') id: string) {
    const migration = this.activeMigrations.get(id);
    if (!migration) return { error: 'Migration not found' };
    return migration;
  }

  private async runMigration(
    migrationId: string,
    repoSource: string,
    outputPath: string,
    maxRetries: number,
  ): Promise<void> {
    const migration = this.activeMigrations.get(migrationId)!;

    const result = await this.graph.run(repoSource, outputPath, maxRetries, (stage, message) => {
      migration.progress.push(`[${stage}] ${message}`);
    });

    if (result.codebase) {
      await this.fileWriter.writeFiles(outputPath, result.codebase.files);
    }

    migration.status = result.status;
    migration.progress.push(`Done: ${result.qualityReport}`);
  }
}
