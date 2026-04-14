import { Injectable } from '@nestjs/common';
import { FileAnalysis, ClassInfo } from '../../domain/entities/file-analysis.entity';
import { ChunkMetadata, ChunkType } from '../../domain/value-objects/chunk-metadata.vo';
import { v4 as uuidv4 } from 'uuid';

export interface CodeChunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
}

const MAX_CHUNK_TOKENS = 1500;
const MIN_CHUNK_TOKENS = 50;
const TOKENS_PER_CHAR = 0.25; // ~4 chars per token

function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

@Injectable()
export class ChunkingService {
  /**
   * Produces RAG-ready chunks from a parsed file.
   * Uses AST structure for semantic boundaries.
   */
  chunkFile(analysis: FileAnalysis, repoId: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = analysis.rawContent.split('\n');
    const importBlock = this.extractImportBlock(lines);

    if (analysis.classes.length > 0) {
      for (const cls of analysis.classes) {
        chunks.push(...this.chunkClass(cls, lines, importBlock, analysis, repoId));
      }
    } else if (analysis.functions.length > 0) {
      // File with top-level functions
      for (const fn of analysis.functions) {
        const fnLines = lines.slice(fn.startLine - 1, fn.endLine);
        const content = [importBlock, ...fnLines].join('\n').trim();
        chunks.push(this.makeChunk(content, repoId, {
          type: 'code',
          filePath: analysis.filePath,
          language: analysis.language,
          startLine: fn.startLine,
          endLine: fn.endLine,
          functionName: fn.name,
        }));
      }
    } else {
      // No structure detected — chunk by sliding window
      chunks.push(...this.slidingWindowChunk(analysis, repoId));
    }

    // Business rule chunks
    for (const rule of analysis.businessRules) {
      const ruleLines = lines.slice(rule.startLine - 1, rule.endLine);
      chunks.push(this.makeChunk(
        `// Business Rule: ${rule.name}\n// Category: ${rule.category}\n// ${rule.description}\n${ruleLines.join('\n')}`,
        repoId,
        {
          type: 'business_rule',
          filePath: analysis.filePath,
          language: analysis.language,
          startLine: rule.startLine,
          endLine: rule.endLine,
          ruleName: rule.name,
          ruleCategory: rule.category,
        },
      ));
    }

    // Dependency chunk
    if (analysis.imports.length > 0) {
      const depContent = [
        `// Dependencies of: ${analysis.filePath}`,
        `// Imports: ${analysis.imports.map((i) => i.source).join(', ')}`,
        `// Exports: ${analysis.exports.join(', ')}`,
      ].join('\n');

      chunks.push(this.makeChunk(depContent, repoId, {
        type: 'dependency',
        filePath: analysis.filePath,
        language: analysis.language,
        imports: analysis.imports.map((i) => i.source),
        exports: analysis.exports,
      }));
    }

    return chunks.filter((c) => estimateTokens(c.content) >= MIN_CHUNK_TOKENS);
  }

  private chunkClass(
    cls: ClassInfo,
    lines: string[],
    importBlock: string,
    analysis: FileAnalysis,
    repoId: string,
  ): CodeChunk[] {
    const classLines = lines.slice(cls.startLine - 1, cls.endLine);
    const classTokens = estimateTokens(classLines.join('\n'));

    // Small class: one chunk
    if (classTokens <= MAX_CHUNK_TOKENS) {
      const content = [importBlock, ...classLines].join('\n').trim();
      return [this.makeChunk(content, repoId, {
        type: 'code',
        filePath: analysis.filePath,
        language: analysis.language,
        startLine: cls.startLine,
        endLine: cls.endLine,
        className: cls.name,
      })];
    }

    // Large class: split by method
    const chunks: CodeChunk[] = [];
    const classHeader = this.extractClassHeader(classLines);

    for (const method of cls.methods) {
      const methodLines = lines.slice(method.startLine - 1, method.endLine);
      const content = [importBlock, classHeader, ...methodLines, '}'].join('\n').trim();
      const truncated = this.truncateToMaxTokens(content);

      chunks.push(this.makeChunk(truncated, repoId, {
        type: 'code',
        filePath: analysis.filePath,
        language: analysis.language,
        startLine: method.startLine,
        endLine: method.endLine,
        className: cls.name,
        functionName: method.name,
      }));
    }

    return chunks;
  }

  private slidingWindowChunk(analysis: FileAnalysis, repoId: string): CodeChunk[] {
    const lines = analysis.rawContent.split('\n');
    const chunks: CodeChunk[] = [];
    const windowSize = 100;
    const overlap = 20;

    for (let i = 0; i < lines.length; i += windowSize - overlap) {
      const windowLines = lines.slice(i, i + windowSize);
      const content = windowLines.join('\n').trim();
      if (content.length === 0) continue;

      chunks.push(this.makeChunk(content, repoId, {
        type: 'code',
        filePath: analysis.filePath,
        language: analysis.language,
        startLine: i + 1,
        endLine: Math.min(i + windowSize, lines.length),
      }));
    }

    return chunks;
  }

  private extractImportBlock(lines: string[]): string {
    const importLines: string[] = [];
    for (const line of lines) {
      if (/^import\s|^require\s|^from\s|^using\s|^#include/.test(line.trim())) {
        importLines.push(line);
      } else if (importLines.length > 0 && line.trim() === '') {
        break;
      }
    }
    return importLines.join('\n');
  }

  private extractClassHeader(classLines: string[]): string {
    // First 20 lines of the class (declaration + fields)
    return classLines.slice(0, Math.min(20, classLines.length)).join('\n');
  }

  private truncateToMaxTokens(content: string): string {
    if (estimateTokens(content) <= MAX_CHUNK_TOKENS) return content;
    const maxChars = MAX_CHUNK_TOKENS / TOKENS_PER_CHAR;
    return content.slice(0, maxChars) + '\n// ... (truncated)';
  }

  private makeChunk(content: string, repoId: string, metadata: Omit<ChunkMetadata, 'chunkId' | 'repoId'>): CodeChunk {
    const id = uuidv4();
    return {
      id,
      content,
      metadata: { chunkId: id, repoId, ...metadata } as ChunkMetadata,
    };
  }
}
