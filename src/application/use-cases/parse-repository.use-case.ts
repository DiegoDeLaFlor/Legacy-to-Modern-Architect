import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RepoManifest } from '../../domain/entities/repo-manifest.entity';
import { RepositoryAnalysis } from '../../domain/entities/repository-analysis.entity';
import { DependencyGraph } from '../../domain/entities/dependency-graph.entity';
import { detectLanguageFromExtension } from '../../domain/value-objects/language-type.vo';
import { LanguageParserFactory } from '../../infrastructure/parsers/language-parser.factory';
import { loadAppConfig } from '../../config/app.config';

@Injectable()
export class ParseRepositoryUseCase {
  private readonly logger = new Logger(ParseRepositoryUseCase.name);

  constructor(private readonly parserFactory: LanguageParserFactory) {}

  async execute(manifest: RepoManifest): Promise<RepositoryAnalysis> {
    const config = loadAppConfig();
    const concurrency = Math.max(1, config.parseWorkerConcurrency);

    this.logger.log(`Parsing ${manifest.filePaths.length} files with concurrency=${concurrency}`);

    const results = await this.runWithConcurrency(manifest.filePaths, concurrency, async (filePath) => {
        const ext = path.extname(filePath);
        const language = detectLanguageFromExtension(ext);
        const parser = this.parserFactory.getParser(language);

        let content: string;
        try {
          content = await fs.readFile(filePath, 'utf-8');
        } catch {
          this.logger.warn(`Cannot read file: ${filePath}`);
          return null;
        }

        try {
          const analysis = await parser.parseFile(content, filePath);
          if (analysis.hasParseError) {
            this.logger.warn(`Parse error in ${filePath}: ${analysis.parseError}`);
          }
          return analysis;
        } catch (err: any) {
          this.logger.error(`Unexpected parse failure for ${filePath}: ${err.message}`);
          return null;
        }
      },
    );

    const files = results.filter((r) => r !== null);

    // Build dependency graph from import relationships
    const graph = new DependencyGraph();
    for (const file of files) {
      graph.addNode(file.filePath);
      for (const imp of file.imports) {
        // Resolve relative imports to absolute paths
        if (imp.source.startsWith('.')) {
          const resolved = this.resolveImport(file.filePath, imp.source, manifest.workspacePath);
          if (resolved) graph.addEdge(file.filePath, resolved);
        }
      }
    }
    graph.computeCentrality();

    this.logger.log(`Parsed ${files.length}/${manifest.filePaths.length} files successfully`);

    return new RepositoryAnalysis(manifest, files, graph, new Date());
  }

  private async runWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>,
  ): Promise<R[]> {
    if (items.length === 0) return [];

    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(concurrency, items.length));

    const workerLoop = async (): Promise<void> => {
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= items.length) return;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => workerLoop()));
    return results;
  }

  private resolveImport(fromFile: string, importPath: string, repoRoot: string): string | null {
    const dir = path.dirname(fromFile);
    const extensions = ['.ts', '.js', '.java', '.py'];

    for (const ext of extensions) {
      const resolved = path.resolve(dir, importPath + ext);
      if (resolved.startsWith(repoRoot)) return resolved;
    }

    // Try as directory index
    const indexResolved = path.resolve(dir, importPath, 'index.ts');
    if (indexResolved.startsWith(repoRoot)) return indexResolved;

    return null;
  }
}
