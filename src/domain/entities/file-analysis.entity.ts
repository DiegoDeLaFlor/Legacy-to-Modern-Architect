import { LanguageType } from '../value-objects/language-type.vo';

export interface ClassInfo {
  name: string;
  startLine: number;
  endLine: number;
  methods: MethodInfo[];
  fields: FieldInfo[];
  superClass?: string;
  interfaces?: string[];
}

export interface MethodInfo {
  name: string;
  startLine: number;
  endLine: number;
  parameters: string[];
  returnType?: string;
  isPublic: boolean;
}

export interface FieldInfo {
  name: string;
  type?: string;
  isPublic: boolean;
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
}

export interface BusinessRuleInfo {
  name: string;
  description: string;
  startLine: number;
  endLine: number;
  category: 'validation' | 'transformation' | 'calculation' | 'authorization' | 'other';
}

export interface DataModelInfo {
  name: string;
  fields: Array<{ name: string; type: string; nullable?: boolean }>;
  isEntity: boolean;
  tableName?: string;
}

export class FileAnalysis {
  constructor(
    public readonly filePath: string,
    public readonly language: LanguageType,
    public readonly classes: ClassInfo[],
    public readonly functions: MethodInfo[],
    public readonly imports: ImportInfo[],
    public readonly exports: string[],
    public readonly businessRules: BusinessRuleInfo[],
    public readonly dataModels: DataModelInfo[],
    public readonly rawContent: string,
    public readonly parseError?: string,
  ) {}

  get hasParseError(): boolean {
    return !!this.parseError;
  }

  get topLevelDeclarations(): string[] {
    return [
      ...this.classes.map((c) => c.name),
      ...this.functions.map((f) => f.name),
    ];
  }
}
