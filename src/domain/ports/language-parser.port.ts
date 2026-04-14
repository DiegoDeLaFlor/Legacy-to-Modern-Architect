import { LanguageType } from '../value-objects/language-type.vo';
import { FileAnalysis } from '../entities/file-analysis.entity';

/**
 * Strategy contract for language-specific parsers.
 * Each implementation handles one or more source languages.
 */
export interface ILanguageParser {
  supportsLanguage(language: LanguageType): boolean;
  parseFile(content: string, filePath: string): Promise<FileAnalysis>;
}

export const LANGUAGE_PARSER_TOKEN = 'LANGUAGE_PARSERS';
