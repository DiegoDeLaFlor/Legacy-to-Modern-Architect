import { Injectable, Inject, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { IRepositorySource, REPOSITORY_SOURCE_TOKEN } from '../../domain/ports/repository-source.port';
import { RepoManifest, LanguageStat } from '../../domain/entities/repo-manifest.entity';
import { LanguageType, detectLanguageFromExtension } from '../../domain/value-objects/language-type.vo';
import { loadAppConfig } from '../../config/app.config';

const IGNORED_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', 'target', '__pycache__',
  '.class', '.pyc', '.jar', '.war', '.ear', '.min.js', '.map',
  'vendor', '.next', '.nuxt',
];

const CODE_EXTENSIONS = new Set([
  '.ts', '.js', '.java', '.php', '.py', '.cbl', '.cob',
  '.cs', '.rb', '.go', '.kt', '.scala', '.swift',
]);

@Injectable()
export class IngestRepositoryUseCase {
  private readonly logger = new Logger(IngestRepositoryUseCase.name);

  constructor(
    @Inject(REPOSITORY_SOURCE_TOKEN) private readonly repoSource: IRepositorySource,
  ) {}

  async execute(source: string): Promise<RepoManifest> {
    this.logger.log(`Ingesting repository: ${source}`);
    const workspacePath = await this.repoSource.prepare(source);
    const repoName = path.basename(source.replace(/\.git$/, ''));
    const repoId = this.generateRepoId(source);

    const filePaths = await this.discoverFiles(workspacePath);
    this.logger.log(`Discovered ${filePaths.length} code files`);

    const languageStats = this.computeLanguageStats(filePaths);
    const estimatedTokens = await this.estimateTotalTokens(filePaths);

    return new RepoManifest(
      repoId,
      repoName,
      workspacePath,
      source,
      filePaths,
      languageStats,
      filePaths.length,
      estimatedTokens,
      new Date(),
    );
  }

  private async discoverFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    await this.walk(dir, results);
    return results;
  }

  private async walk(dir: string, results: string[]): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_PATTERNS.some((p) => entry.includes(p))) continue;
      const fullPath = path.join(dir, entry);
      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        await this.walk(fullPath, results);
      } else if (CODE_EXTENSIONS.has(path.extname(entry).toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  private computeLanguageStats(filePaths: string[]): LanguageStat[] {
    const counts = new Map<LanguageType, number>();
    for (const fp of filePaths) {
      const lang = detectLanguageFromExtension(path.extname(fp));
      counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([language, fileCount]) => ({
      language,
      fileCount,
      estimatedTokens: fileCount * 500, // rough estimate before reading
    }));
  }

  private async estimateTotalTokens(filePaths: string[]): Promise<number> {
    let total = 0;
    // Sample first 50 files for estimation
    const sample = filePaths.slice(0, 50);
    let sampleTotal = 0;
    for (const fp of sample) {
      try {
        const content = await fs.readFile(fp, 'utf-8');
        sampleTotal += Math.ceil(content.length / 4);
      } catch {
        sampleTotal += 500;
      }
    }
    const avgPerFile = sample.length > 0 ? sampleTotal / sample.length : 500;
    total = Math.ceil(avgPerFile * filePaths.length);
    return total;
  }

  private generateRepoId(source: string): string {
    return createHash('md5').update(source).digest('hex').slice(0, 12);
  }
}
