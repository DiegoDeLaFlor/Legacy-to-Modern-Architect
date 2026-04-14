export type FindingSeverity = 'critical' | 'warning' | 'info';
export type FindingCategory = 'structure' | 'pattern' | 'business-logic' | 'compilation';

export interface ValidationFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  filePath?: string;
  message: string;
  suggestion?: string;
}

export interface ICodeValidator {
  validate(outputDir: string): Promise<ValidationFinding[]>;
}

export const CODE_VALIDATOR_TOKEN = 'CODE_VALIDATOR';
