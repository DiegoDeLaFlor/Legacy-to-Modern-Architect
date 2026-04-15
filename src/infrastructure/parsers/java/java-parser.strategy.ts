import { Injectable } from '@nestjs/common';
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

// java-parser is ESM-only. TypeScript compiles `import()` to `require()` in CommonJS,
// so we use new Function() to emit a real dynamic import that bypasses that transform.
const _esmImport = new Function('p', 'return import(p)');

let javaParserModule: { parse: (code: string) => any } | null = null;
async function getJavaParser() {
  if (!javaParserModule) {
    javaParserModule = await _esmImport('java-parser') as any;
  }
  return javaParserModule!;
}

/** Recursively finds the last token's endLine in a CST subtree */
function lastLine(node: any): number {
  if (!node) return 0;
  if (typeof node.endLine === 'number') return node.endLine;
  let max = 0;
  if (Array.isArray(node)) {
    for (const child of node) max = Math.max(max, lastLine(child));
  } else if (node.children) {
    for (const key of Object.keys(node.children)) {
      max = Math.max(max, lastLine(node.children[key]));
    }
  }
  return max;
}

@Injectable()
export class JavaParserStrategy implements ILanguageParser {
  supportsLanguage(language: LanguageType): boolean {
    return language === LanguageType.Java;
  }

  async parseFile(content: string, filePath: string): Promise<FileAnalysis> {
    try {
      const { parse } = await getJavaParser();
      const cst = parse(content);
      return this.extractFromCst(cst, content, filePath);
    } catch (err: any) {
      return new FileAnalysis(
        filePath, LanguageType.Java,
        [], [], [], [], [], [],
        content, `Java parse error: ${err.message}`,
      );
    }
  }

  private extractFromCst(cst: any, content: string, filePath: string): FileAnalysis {
    const ocu = cst.children.ordinaryCompilationUnit?.[0];
    if (!ocu) throw new Error('Not a compilation unit');

    const imports = this.extractImports(ocu);
    const { classes, businessRules, dataModels } = this.extractTypes(ocu);
    const exports = classes.map((c) => c.name);

    return new FileAnalysis(
      filePath, LanguageType.Java,
      classes, [], imports, exports,
      businessRules, dataModels, content,
    );
  }

  // ─── Imports ─────────────────────────────────────────────────────────────

  private extractImports(ocu: any): ImportInfo[] {
    const importDecls = ocu.children.importDeclaration ?? [];
    return importDecls.map((imp: any) => {
      const parts = imp.children.packageOrTypeName?.[0]?.children?.Identifier ?? [];
      const source = parts.map((t: any) => t.image).join('.');
      const specifier = parts.length ? parts[parts.length - 1].image : source;
      return { source, specifiers: [specifier] };
    });
  }

  // ─── Types (classes / interfaces / enums) ────────────────────────────────

  private extractTypes(ocu: any): {
    classes: ClassInfo[];
    businessRules: BusinessRuleInfo[];
    dataModels: DataModelInfo[];
  } {
    const classes: ClassInfo[] = [];
    const businessRules: BusinessRuleInfo[] = [];
    const dataModels: DataModelInfo[] = [];

    for (const typeDecl of ocu.children.typeDeclaration ?? []) {
      // Class
      if (typeDecl.children.classDeclaration) {
        const result = this.extractClass(typeDecl.children.classDeclaration[0]);
        if (result) {
          classes.push(result.classInfo);
          businessRules.push(...result.businessRules);
          if (result.dataModel) dataModels.push(result.dataModel);
        }
      }
      // Interface (treat as class without body)
      if (typeDecl.children.interfaceDeclaration) {
        const result = this.extractInterface(typeDecl.children.interfaceDeclaration[0]);
        if (result) classes.push(result);
      }
    }

    return { classes, businessRules, dataModels };
  }

  // ─── Class ───────────────────────────────────────────────────────────────

  private extractClass(classDecl: any): {
    classInfo: ClassInfo;
    businessRules: BusinessRuleInfo[];
    dataModel: DataModelInfo | null;
  } | null {
    const normal = classDecl.children.normalClassDeclaration?.[0];
    if (!normal) return null;

    const nameToken = normal.children.typeIdentifier?.[0]?.children?.Identifier?.[0];
    if (!nameToken) return null;

    const className = nameToken.image as string;
    const startLine = nameToken.startLine as number;

    // Annotations on the class (classModifier can contain annotations)
    const modifiers = classDecl.children.classDeclaration?.[0]?.children?.classModifier ?? [];
    const annotations = this.extractAnnotationNames(classDecl);

    const members = normal.children.classBody?.[0]?.children?.classBodyDeclaration ?? [];
    const methods: MethodInfo[] = [];
    const fields: FieldInfo[] = [];
    const businessRules: BusinessRuleInfo[] = [];

    for (const member of members) {
      const memberDecl = member.children.classMemberDeclaration?.[0];
      if (!memberDecl) continue;

      if (memberDecl.children.methodDeclaration) {
        const m = this.extractMethod(memberDecl.children.methodDeclaration[0], className);
        if (m) {
          methods.push(m.method);
          if (m.businessRule) businessRules.push(m.businessRule);
        }
      }

      if (memberDecl.children.fieldDeclaration) {
        const f = this.extractField(memberDecl.children.fieldDeclaration[0]);
        if (f) fields.push(f);
      }
    }

    const endLine = lastLine(normal.children.classBody);
    const classInfo: ClassInfo = { name: className, startLine, endLine, methods, fields };

    // Data model: @Entity, @Table, @Document, *Entity, *Model suffixes
    const isEntity =
      annotations.some((a) => ['Entity', 'Table', 'Document', 'MappedSuperclass'].includes(a)) ||
      /Entity$|Model$|Record$/i.test(className);

    const dataModel: DataModelInfo | null = isEntity
      ? {
          name: className,
          fields: fields.map((f) => ({ name: f.name, type: f.type ?? 'unknown' })),
          isEntity: true,
        }
      : null;

    return { classInfo, businessRules, dataModel };
  }

  // ─── Interface ───────────────────────────────────────────────────────────

  private extractInterface(ifaceDecl: any): ClassInfo | null {
    const normal = ifaceDecl.children.normalInterfaceDeclaration?.[0];
    if (!normal) return null;
    const nameToken = normal.children.typeIdentifier?.[0]?.children?.Identifier?.[0];
    if (!nameToken) return null;

    return {
      name: nameToken.image,
      startLine: nameToken.startLine,
      endLine: lastLine(normal.children.interfaceBody),
      methods: [],
      fields: [],
    };
  }

  // ─── Method ──────────────────────────────────────────────────────────────

  private extractMethod(methodDecl: any, className: string): {
    method: MethodInfo;
    businessRule: BusinessRuleInfo | null;
  } | null {
    const header = methodDecl.children.methodHeader?.[0];
    if (!header) return null;

    const declarator = header.children.methodDeclarator?.[0];
    const nameToken = declarator?.children?.Identifier?.[0];
    if (!nameToken) return null;

    const name = nameToken.image as string;
    const startLine = nameToken.startLine as number;
    const endLine = lastLine(methodDecl.children.methodBody);

    // Modifiers
    const modifiers = (methodDecl.children.methodModifier ?? [])
      .map((m: any) => Object.keys(m.children)[0]);
    const isPublic = modifiers.includes('Public') || !modifiers.includes('Private');

    // Parameters
    const formalParams = declarator.children.formalParameterList?.[0]
      ?.children?.formalParameter ?? [];
    const parameters = formalParams.map((p: any) => {
      const id = p.children.variableDeclaratorId?.[0]?.children?.Identifier?.[0];
      return id?.image ?? 'param';
    });

    const method: MethodInfo = { name, startLine, endLine, parameters, isPublic };

    // Business rule detection
    const businessRule = this.isBusinessRule(name)
      ? {
          name: `${className}.${name}`,
          description: `Business rule in ${className}: ${name}`,
          startLine,
          endLine,
          category: this.inferCategory(name),
        } as BusinessRuleInfo
      : null;

    return { method, businessRule };
  }

  // ─── Field ───────────────────────────────────────────────────────────────

  private extractField(fieldDecl: any): FieldInfo | null {
    const varList = fieldDecl.children.variableDeclaratorList?.[0];
    const varDeclarator = varList?.children?.variableDeclarator?.[0];
    const nameToken = varDeclarator?.children?.variableDeclaratorId?.[0]?.children?.Identifier?.[0];
    if (!nameToken) return null;

    const modifiers = (fieldDecl.children.fieldModifier ?? [])
      .map((m: any) => Object.keys(m.children)[0]);

    // Extract type name from unannType
    const typeNode = fieldDecl.children.unannType?.[0];
    const type = this.extractTypeName(typeNode);

    return {
      name: nameToken.image,
      type,
      isPublic: modifiers.includes('Public'),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private extractTypeName(typeNode: any): string {
    if (!typeNode) return 'unknown';
    // Walk to find first Identifier
    if (typeNode.image) return typeNode.image;
    if (typeNode.children) {
      for (const key of Object.keys(typeNode.children)) {
        const result = this.extractTypeName(typeNode.children[key]);
        if (result !== 'unknown') return result;
      }
    }
    if (Array.isArray(typeNode)) {
      for (const item of typeNode) {
        const result = this.extractTypeName(item);
        if (result !== 'unknown') return result;
      }
    }
    return 'unknown';
  }

  private extractAnnotationNames(node: any): string[] {
    const names: string[] = [];
    const walk = (n: any) => {
      if (!n) return;
      if (n.name === 'annotation' && n.children?.typeName) {
        const id = n.children.typeName[0]?.children?.Identifier?.[0];
        if (id) names.push(id.image);
      }
      if (n.children) {
        for (const key of Object.keys(n.children)) walk(n.children[key]);
      }
      if (Array.isArray(n)) n.forEach(walk);
    };
    walk(node);
    return names;
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
