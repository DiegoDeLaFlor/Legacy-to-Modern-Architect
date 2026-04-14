import { Injectable, Inject } from '@nestjs/common';
import { ILanguageParser } from '../../../domain/ports/language-parser.port';
import { ILlmProvider, LLM_PROVIDER_TOKEN } from '../../../domain/ports/llm-provider.port';
import { LanguageType } from '../../../domain/value-objects/language-type.vo';
import { FileAnalysis } from '../../../domain/entities/file-analysis.entity';

/**
 * Fallback parser for languages without native AST support.
 * Uses the LLM to extract structure in JSON format.
 */
@Injectable()
export class GenericLlmParserStrategy implements ILanguageParser {
  constructor(
    @Inject(LLM_PROVIDER_TOKEN) private readonly llm: ILlmProvider,
  ) {}

  supportsLanguage(_language: LanguageType): boolean {
    // Only used as fallback — LanguageParserFactory calls this last
    return true;
  }

  async parseFile(content: string, filePath: string): Promise<FileAnalysis> {
    const truncated = content.length > 8000 ? content.slice(0, 8000) + '\n... (truncated)' : content;

    const prompt = `Analyze this source code file and extract its structure as JSON.

File: ${filePath}
\`\`\`
${truncated}
\`\`\`

Return ONLY a valid JSON object with this exact structure:
{
  "classes": [{"name": string, "startLine": number, "endLine": number, "methods": [{"name": string, "startLine": number, "endLine": number, "parameters": string[], "isPublic": boolean}], "fields": [{"name": string, "isPublic": boolean}]}],
  "functions": [{"name": string, "startLine": number, "endLine": number, "parameters": string[], "isPublic": boolean}],
  "imports": [{"source": string, "specifiers": string[]}],
  "exports": string[],
  "businessRules": [{"name": string, "description": string, "startLine": number, "endLine": number, "category": "validation"|"transformation"|"calculation"|"authorization"|"other"}],
  "dataModels": [{"name": string, "fields": [{"name": string, "type": string}], "isEntity": boolean}]
}`;

    try {
      const response = await this.llm.call([
        { role: 'system', content: 'You are a code analysis expert. Return only valid JSON, no explanation.' },
        { role: 'user', content: prompt },
      ], { jsonMode: true, temperature: 0 });

      const parsed = JSON.parse(response);
      return new FileAnalysis(
        filePath,
        LanguageType.Generic,
        parsed.classes ?? [],
        parsed.functions ?? [],
        parsed.imports ?? [],
        parsed.exports ?? [],
        parsed.businessRules ?? [],
        parsed.dataModels ?? [],
        content,
      );
    } catch (err: any) {
      return new FileAnalysis(
        filePath,
        LanguageType.Generic,
        [], [], [], [], [], [],
        content,
        `LLM parse error: ${err.message}`,
      );
    }
  }
}
