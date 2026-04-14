import { Injectable } from '@nestjs/common';
import { VectorSearchResult } from '../../domain/ports/vector-store.port';

const MAX_CONTEXT_TOKENS = 12_000;
const APPROX_CHARS_PER_TOKEN = 4;

@Injectable()
export class PromptBuilderService {
  /**
   * Assembles retrieved RAG chunks into a prompt context string,
   * respecting the token budget and deduplicating overlapping content.
   */
  buildContext(results: VectorSearchResult[], tokenBudget = MAX_CONTEXT_TOKENS): string {
    const seen = new Set<string>();
    const sections: string[] = [];
    let usedTokens = 0;
    const maxChars = tokenBudget * APPROX_CHARS_PER_TOKEN;

    // Sort by relevance descending
    const sorted = [...results].sort((a, b) => b.score - a.score);

    for (const result of sorted) {
      const content = result.document.content;
      const meta = result.document.metadata;

      // Dedup by first 200 chars fingerprint
      const fingerprint = content.slice(0, 200);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      const chunkChars = content.length;
      if (usedTokens * APPROX_CHARS_PER_TOKEN + chunkChars > maxChars) break;

      const header = `// --- ${meta.type.toUpperCase()} | ${meta.filePath}${meta.className ? ` > ${meta.className}` : ''}${meta.functionName ? `.${meta.functionName}` : ''} ---`;
      sections.push(`${header}\n${content}`);
      usedTokens += Math.ceil(chunkChars / APPROX_CHARS_PER_TOKEN);
    }

    return sections.join('\n\n');
  }

  /** Wraps context and task into a complete user message */
  buildUserMessage(task: string, context: string): string {
    if (!context) return task;
    return `## Legacy Codebase Context\n\n${context}\n\n## Task\n\n${task}`;
  }
}
