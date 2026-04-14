import { RepoManifest } from './repo-manifest.entity';
import { FileAnalysis } from './file-analysis.entity';
import { DependencyGraph } from './dependency-graph.entity';

export class RepositoryAnalysis {
  constructor(
    public readonly manifest: RepoManifest,
    public readonly files: FileAnalysis[],
    public readonly dependencyGraph: DependencyGraph,
    public readonly analyzedAt: Date,
  ) {}

  getFile(filePath: string): FileAnalysis | undefined {
    return this.files.find((f) => f.filePath === filePath);
  }

  get filesWithErrors(): FileAnalysis[] {
    return this.files.filter((f) => f.hasParseError);
  }

  get successfullyParsedFiles(): FileAnalysis[] {
    return this.files.filter((f) => !f.hasParseError);
  }

  get allBusinessRules() {
    return this.files.flatMap((f) =>
      f.businessRules.map((r) => ({ ...r, filePath: f.filePath })),
    );
  }

  get allDataModels() {
    return this.files.flatMap((f) =>
      f.dataModels.map((m) => ({ ...m, filePath: f.filePath })),
    );
  }
}
