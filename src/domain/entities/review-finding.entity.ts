export type FindingSeverity = 'critical' | 'warning' | 'info';
export type FindingCategory = 'structure' | 'pattern' | 'business-logic' | 'compilation';

export class ReviewFinding {
  constructor(
    public readonly severity: FindingSeverity,
    public readonly category: FindingCategory,
    public readonly message: string,
    public readonly moduleName?: string,
    public readonly filePath?: string,
    public readonly suggestion?: string,
  ) {}

  get isCritical(): boolean {
    return this.severity === 'critical';
  }

  toPromptString(): string {
    const location = this.filePath ? ` [${this.filePath}]` : '';
    const mod = this.moduleName ? ` (module: ${this.moduleName})` : '';
    return `[${this.severity.toUpperCase()}]${location}${mod}: ${this.message}${
      this.suggestion ? ` → Suggestion: ${this.suggestion}` : ''
    }`;
  }
}
