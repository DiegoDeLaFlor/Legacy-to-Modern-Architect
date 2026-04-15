import { Injectable } from '@nestjs/common';
// php-parser ships as CommonJS — safe to require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Engine = require('php-parser');
import { ILanguageParser } from '../../../domain/ports/language-parser.port';
import { LanguageType } from '../../../domain/value-objects/language-type.vo';
import {
  FileAnalysis,
  ClassInfo,
  MethodInfo,
  FieldInfo,
  ImportInfo,
  BusinessRuleInfo,
  DataModelInfo,
} from '../../../domain/entities/file-analysis.entity';

const phpEngine = new Engine({
  parser: { extractDoc: true, suppressErrors: true },
  ast: { withPositions: true },
});

@Injectable()
export class PhpParserStrategy implements ILanguageParser {
  supportsLanguage(language: LanguageType): boolean {
    return language === LanguageType.PHP;
  }

  async parseFile(content: string, filePath: string): Promise<FileAnalysis> {
    try {
      const ast = phpEngine.parseCode(content, filePath);
      return this.extractFromAst(ast, content, filePath);
    } catch (err: any) {
      return new FileAnalysis(
        filePath, LanguageType.PHP,
        [], [], [], [], [], [],
        content, `PHP parse error: ${err.message}`,
      );
    }
  }

  private extractFromAst(ast: any, content: string, filePath: string): FileAnalysis {
    const classes: ClassInfo[] = [];
    const imports: ImportInfo[] = [];
    const businessRules: BusinessRuleInfo[] = [];
    const dataModels: DataModelInfo[] = [];

    // Flatten all nodes (handle namespace wrappers)
    const nodes = this.flattenNodes(ast.children ?? []);

    for (const node of nodes) {
      if (node.kind === 'usegroup') {
        imports.push(...this.extractUseGroup(node));
      }

      if (node.kind === 'class' || node.kind === 'interface' || node.kind === 'trait') {
        const result = this.extractClass(node);
        if (result) {
          classes.push(result.classInfo);
          businessRules.push(...result.businessRules);
          if (result.dataModel) dataModels.push(result.dataModel);
        }
      }
    }

    const exports = classes.map((c) => c.name);

    return new FileAnalysis(
      filePath, LanguageType.PHP,
      classes, [], imports, exports,
      businessRules, dataModels, content,
    );
  }

  // ─── Flatten namespace wrappers ──────────────────────────────────────────

  private flattenNodes(nodes: any[]): any[] {
    const result: any[] = [];
    for (const node of nodes) {
      if (node.kind === 'namespace') {
        result.push(...this.flattenNodes(node.children ?? []));
      } else {
        result.push(node);
      }
    }
    return result;
  }

  // ─── Imports (use statements) ────────────────────────────────────────────

  private extractUseGroup(node: any): ImportInfo[] {
    return (node.items ?? []).map((item: any) => {
      // item.name is already a string like "App\Repository\UserRepository"
      const source = typeof item.name === 'string' ? item.name : String(item.name ?? '');
      const parts = source.split('\\');
      const specifier = item.alias?.name ?? parts[parts.length - 1];
      return { source, specifiers: [specifier] };
    });
  }

  // ─── Class / Interface / Trait ───────────────────────────────────────────

  private extractClass(node: any): {
    classInfo: ClassInfo;
    businessRules: BusinessRuleInfo[];
    dataModel: DataModelInfo | null;
  } | null {
    const name = node.name?.name ?? node.name;
    if (!name) return null;

    const startLine = node.loc?.start?.line ?? 0;
    const endLine = node.loc?.end?.line ?? startLine;

    const methods: MethodInfo[] = [];
    const fields: FieldInfo[] = [];
    const businessRules: BusinessRuleInfo[] = [];

    for (const member of node.body ?? []) {
      if (member.kind === 'method') {
        const m = this.extractMethod(member, name);
        if (m) {
          methods.push(m.method);
          if (m.businessRule) businessRules.push(m.businessRule);
        }
      }

      if (member.kind === 'property' || member.kind === 'propertystatement') {
        fields.push(...this.extractProperty(member));
      }
    }

    // Detect parent class and interfaces
    const superClass = node.extends ? this.nameToString(node.extends) : undefined;

    const classInfo: ClassInfo = { name, startLine, endLine, methods, fields, superClass };

    // Data model heuristic: Doctrine/Eloquent annotations, or naming conventions
    const docComment: string = node.leadingComments?.[0]?.value ?? '';
    const isEntity =
      docComment.includes('@ORM\\Entity') ||
      docComment.includes('@Entity') ||
      /Entity$|Model$|Record$/i.test(name);

    const dataModel: DataModelInfo | null = isEntity
      ? {
          name,
          fields: fields.map((f) => ({ name: f.name, type: f.type ?? 'mixed' })),
          isEntity: true,
        }
      : null;

    return { classInfo, businessRules, dataModel };
  }

  // ─── Method ──────────────────────────────────────────────────────────────

  private extractMethod(node: any, className: string): {
    method: MethodInfo;
    businessRule: BusinessRuleInfo | null;
  } | null {
    const name = node.name?.name ?? node.name;
    if (!name) return null;

    const startLine = node.loc?.start?.line ?? 0;
    const endLine = node.loc?.end?.line ?? startLine;
    const isPublic = !node.visibility || node.visibility === 'public';

    const parameters = (node.arguments ?? []).map((p: any) => {
      return p.name?.name ?? p.name ?? 'param';
    });

    const method: MethodInfo = { name, startLine, endLine, parameters, isPublic };

    const businessRule = this.isBusinessRule(name)
      ? {
          name: `${className}::${name}`,
          description: `Business rule in ${className}: ${name}`,
          startLine,
          endLine,
          category: this.inferCategory(name),
        } as BusinessRuleInfo
      : null;

    return { method, businessRule };
  }

  // ─── Property ────────────────────────────────────────────────────────────

  private extractProperty(node: any): FieldInfo[] {
    // `propertystatement` wraps `properties[]`; each item is a `property` node
    const items: any[] = node.properties ?? (node.kind === 'property' ? [node] : []);
    return items
      .filter((p: any) => p.name)
      .map((p: any) => {
        const rawName = p.name?.name ?? p.name;
        return {
          name: typeof rawName === 'string' ? rawName : String(rawName),
          type: node.type ? this.nameToString(node.type) : undefined,
          isPublic: !node.visibility || node.visibility === 'public',
        };
      });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private nameToString(name: any): string {
    if (!name) return '';
    if (typeof name === 'string') return name;
    if (name.name) return this.nameToString(name.name);
    if (name.resolution) return `${name.resolution}\\${this.nameToString(name.name)}`;
    if (Array.isArray(name)) return name.map((n: any) => this.nameToString(n)).join('\\');
    return String(name);
  }

  private isBusinessRule(name: string): boolean {
    return /validate|check|calculate|compute|apply|enforce|verify|authorize|process|send|sync|notify/i.test(name);
  }

  private inferCategory(name: string): BusinessRuleInfo['category'] {
    if (/validate|check|verify/.test(name)) return 'validation';
    if (/calculate|compute/.test(name)) return 'calculation';
    if (/transform|convert|map|format/.test(name)) return 'transformation';
    if (/authorize|permit|allow|deny/.test(name)) return 'authorization';
    return 'other';
  }
}
