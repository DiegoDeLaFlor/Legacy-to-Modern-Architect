import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ILanguageParser } from '../../../domain/ports/language-parser.port';
import { LanguageType } from '../../../domain/value-objects/language-type.vo';
import { FileAnalysis } from '../../../domain/entities/file-analysis.entity';
import { loadLlmConfig } from '../../../config/llm.config';

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1500;

/**
 * Fallback parser for languages without native AST support.
 * Uses gpt-4o-mini (high TPM limit) with exponential backoff on 429 errors.
 */
@Injectable()
export class GenericLlmParserStrategy implements ILanguageParser {
  private readonly client: OpenAI;
  private readonly parserModel: string;

  constructor() {
    const config = loadLlmConfig();
    this.client = new OpenAI({ apiKey: config.openaiApiKey });
    this.parserModel = config.parserModel;
  }

  supportsLanguage(_language: LanguageType): boolean {
    return true; // Fallback — always last in factory priority
  }

  async parseFile(content: string, filePath: string): Promise<FileAnalysis> {
    const truncated =
      content.length > 6000 ? content.slice(0, 6000) + '\n... (truncated)' : content;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: 'You are a code analysis expert. Return only valid JSON, no explanation.',
      },
      {
        role: 'user',
        content: buildParsePrompt(filePath, truncated),
      },
    ];

    let lastError: string = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.parserModel,
          messages,
          temperature: 0,
          response_format: { type: 'json_object' },
        });

        const raw = response.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(raw);

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
        const is429 = err?.status === 429 || err?.message?.includes('429');

        if (is429 && attempt < MAX_RETRIES) {
          // Exponential backoff: 1.5s, 3s, 6s, 12s
          const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delayMs);
          continue;
        }

        lastError = err?.message ?? String(err);
        break;
      }
    }

    return new FileAnalysis(
      filePath,
      LanguageType.Generic,
      [], [], [], [], [], [],
      content,
      `LLM parse error: ${lastError}`,
    );
  }
}

function buildParsePrompt(filePath: string, content: string): string {
  return `Analyze this source code file and extract its structure as JSON.

File: ${filePath}
\`\`\`
${content}
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
