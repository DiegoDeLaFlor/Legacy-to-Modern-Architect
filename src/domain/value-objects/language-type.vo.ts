export enum LanguageType {
  TypeScript = 'typescript',
  JavaScript = 'javascript',
  Java = 'java',
  PHP = 'php',
  Python = 'python',
  COBOL = 'cobol',
  CSharp = 'csharp',
  Ruby = 'ruby',
  Go = 'go',
  Generic = 'generic',
}

const EXTENSION_MAP: Record<string, LanguageType> = {
  '.ts': LanguageType.TypeScript,
  '.js': LanguageType.JavaScript,
  '.java': LanguageType.Java,
  '.php': LanguageType.PHP,
  '.py': LanguageType.Python,
  '.cbl': LanguageType.COBOL,
  '.cob': LanguageType.COBOL,
  '.cs': LanguageType.CSharp,
  '.rb': LanguageType.Ruby,
  '.go': LanguageType.Go,
};

export function detectLanguageFromExtension(ext: string): LanguageType {
  return EXTENSION_MAP[ext.toLowerCase()] ?? LanguageType.Generic;
}
