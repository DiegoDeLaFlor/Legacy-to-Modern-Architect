import { LanguageType } from './language-type.vo';

export type ChunkType = 'code' | 'summary' | 'dependency' | 'business_rule';

export interface ChunkMetadata {
  chunkId: string;
  repoId: string;
  type: ChunkType;
  filePath: string;
  language: LanguageType;
  startLine?: number;
  endLine?: number;
  className?: string;
  functionName?: string;
  /** For dependency chunks */
  imports?: string[];
  exports?: string[];
  dependedOnBy?: string[];
  /** For business rule chunks */
  ruleName?: string;
  ruleCategory?: string;
}
