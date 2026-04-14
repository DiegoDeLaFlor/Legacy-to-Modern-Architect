import { LanguageType } from '../value-objects/language-type.vo';

export interface LanguageStat {
  language: LanguageType;
  fileCount: number;
  estimatedTokens: number;
}

export class RepoManifest {
  constructor(
    public readonly repoId: string,
    public readonly repoName: string,
    public readonly workspacePath: string,
    public readonly sourceUrl: string,
    public readonly filePaths: string[],
    public readonly languageStats: LanguageStat[],
    public readonly totalFiles: number,
    public readonly estimatedTotalTokens: number,
    public readonly discoveredAt: Date,
  ) {}

  get primaryLanguage(): LanguageType {
    return this.languageStats.reduce((a, b) =>
      a.fileCount >= b.fileCount ? a : b,
    ).language;
  }

  /** Estimated OpenAI embedding cost at $0.02/1M tokens */
  get estimatedEmbeddingCostUsd(): number {
    return (this.estimatedTotalTokens / 1_000_000) * 0.02;
  }

  /** Estimated GPT-4o cost for analysis at ~$5/1M input tokens */
  get estimatedAnalysisCostUsd(): number {
    return (this.estimatedTotalTokens / 1_000_000) * 5;
  }
}
