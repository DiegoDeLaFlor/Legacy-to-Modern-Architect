export interface GeneratedFile {
  relativePath: string;
  content: string;
  /** Which Nest module or Angular feature this belongs to */
  moduleName: string;
  description: string;
}

export class GeneratedCodebase {
  constructor(
    public readonly repoId: string,
    public readonly files: GeneratedFile[],
    public readonly generatedAt: Date,
    /** Interfaces exported by each module — used as context for subsequent modules */
    public readonly contextManifest: Record<string, string[]>,
  ) {}

  getModuleFiles(moduleName: string): GeneratedFile[] {
    return this.files.filter((f) => f.moduleName === moduleName);
  }

  get moduleNames(): string[] {
    return [...new Set(this.files.map((f) => f.moduleName))];
  }
}
