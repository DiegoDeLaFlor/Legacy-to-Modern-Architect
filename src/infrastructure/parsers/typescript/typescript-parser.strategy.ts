import { Injectable } from '@nestjs/common';
import { parse } from '@typescript-eslint/typescript-estree';
import { ILanguageParser } from '../../../domain/ports/language-parser.port';
import { LanguageType } from '../../../domain/value-objects/language-type.vo';
import {
  FileAnalysis,
  ClassInfo,
  MethodInfo,
  ImportInfo,
  BusinessRuleInfo,
  DataModelInfo,
  FieldInfo,
} from '../../../domain/entities/file-analysis.entity';

@Injectable()
export class TypeScriptParserStrategy implements ILanguageParser {
  supportsLanguage(language: LanguageType): boolean {
    return language === LanguageType.TypeScript || language === LanguageType.JavaScript;
  }

  async parseFile(content: string, filePath: string): Promise<FileAnalysis> {
    try {
      const ast = parse(content, {
        jsx: true,
        loc: true,
        range: false,
        comment: false,
        tokens: false,
      });

      const classes: ClassInfo[] = [];
      const functions: MethodInfo[] = [];
      const imports: ImportInfo[] = [];
      const exports: string[] = [];
      const businessRules: BusinessRuleInfo[] = [];
      const dataModels: DataModelInfo[] = [];

      for (const node of ast.body) {
        // Imports
        if (node.type === 'ImportDeclaration') {
          imports.push({
            source: node.source.value as string,
            specifiers: node.specifiers.map((s) => s.local.name),
          });
        }

        // Export declarations
        if (
          node.type === 'ExportNamedDeclaration' ||
          node.type === 'ExportDefaultDeclaration'
        ) {
          if ('declaration' in node && node.declaration) {
            if (
              node.declaration.type === 'ClassDeclaration' &&
              node.declaration.id
            ) {
              exports.push(node.declaration.id.name);
            } else if (
              node.declaration.type === 'FunctionDeclaration' &&
              node.declaration.id
            ) {
              exports.push(node.declaration.id.name);
            }
          }
        }

        // Class declarations
        if (
          node.type === 'ClassDeclaration' ||
          (node.type === 'ExportNamedDeclaration' &&
            'declaration' in node &&
            node.declaration?.type === 'ClassDeclaration')
        ) {
          const classNode =
            node.type === 'ClassDeclaration'
              ? node
              : (node as any).declaration;

          if (classNode && classNode.id) {
            const methods: MethodInfo[] = [];
            const fields: FieldInfo[] = [];

            for (const member of classNode.body.body) {
              if (member.type === 'MethodDefinition' && member.key.type === 'Identifier') {
                const methodBody = member.value;
                methods.push({
                  name: member.key.name,
                  startLine: member.loc?.start.line ?? 0,
                  endLine: member.loc?.end.line ?? 0,
                  parameters: methodBody.params.map((p: any) =>
                    p.type === 'Identifier' ? p.name : 'param',
                  ),
                  isPublic: member.accessibility !== 'private' && member.accessibility !== 'protected',
                });

                // Business rule heuristic: methods with if/switch/validation keywords
                if (this.isBusinessRuleMethod(member.key.name)) {
                  businessRules.push({
                    name: `${classNode.id.name}.${member.key.name}`,
                    description: `Business rule in ${classNode.id.name}: ${member.key.name}`,
                    startLine: member.loc?.start.line ?? 0,
                    endLine: member.loc?.end.line ?? 0,
                    category: this.inferRuleCategory(member.key.name),
                  });
                }
              }

              if (member.type === 'PropertyDefinition' && member.key.type === 'Identifier') {
                fields.push({
                  name: member.key.name,
                  type: member.typeAnnotation
                    ? content.slice(
                        (member.typeAnnotation as any).range?.[0] ?? 0,
                        (member.typeAnnotation as any).range?.[1] ?? 0,
                      )
                    : undefined,
                  isPublic: member.accessibility !== 'private' && member.accessibility !== 'protected',
                });
              }
            }

            const classInfo: ClassInfo = {
              name: classNode.id.name,
              startLine: classNode.loc?.start.line ?? 0,
              endLine: classNode.loc?.end.line ?? 0,
              methods,
              fields,
              superClass: classNode.superClass?.type === 'Identifier' ? classNode.superClass.name : undefined,
            };

            classes.push(classInfo);

            // Data model heuristic: classes ending in Entity, Model, Schema, Dto
            if (/Entity|Model|Schema|Dto|DTO$/i.test(classNode.id.name)) {
              dataModels.push({
                name: classNode.id.name,
                fields: fields.map((f) => ({ name: f.name, type: f.type ?? 'unknown' })),
                isEntity: /Entity$/i.test(classNode.id.name),
              });
            }
          }
        }

        // Top-level function declarations
        if (node.type === 'FunctionDeclaration' && node.id) {
          functions.push({
            name: node.id.name,
            startLine: node.loc?.start.line ?? 0,
            endLine: node.loc?.end.line ?? 0,
            parameters: node.params.map((p: any) =>
              p.type === 'Identifier' ? p.name : 'param',
            ),
            isPublic: true,
          });
        }
      }

      return new FileAnalysis(
        filePath,
        this.detectLanguage(filePath),
        classes,
        functions,
        imports,
        exports,
        businessRules,
        dataModels,
        content,
      );
    } catch (err: any) {
      return new FileAnalysis(
        filePath,
        this.detectLanguage(filePath),
        [], [], [], [], [], [],
        content,
        err.message ?? 'Parse error',
      );
    }
  }

  private detectLanguage(filePath: string): LanguageType {
    return filePath.endsWith('.ts') ? LanguageType.TypeScript : LanguageType.JavaScript;
  }

  private isBusinessRuleMethod(name: string): boolean {
    return /validate|check|calculate|compute|apply|enforce|verify|authorize|process/i.test(name);
  }

  private inferRuleCategory(name: string): BusinessRuleInfo['category'] {
    if (/validate|check|verify/.test(name)) return 'validation';
    if (/calculate|compute/.test(name)) return 'calculation';
    if (/transform|convert|map|format/.test(name)) return 'transformation';
    if (/authorize|permit|allow|deny/.test(name)) return 'authorization';
    return 'other';
  }
}
