import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { IEmbeddingProvider } from '../../domain/ports/embedding-provider.port';
import { loadLlmConfig } from '../../config/llm.config';

const BATCH_SIZE = 512; // safe batch size under OpenAI's 2048 limit

@Injectable()
export class OpenAiEmbeddingAdapter implements IEmbeddingProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  readonly dimensions: number;

  constructor() {
    const config = loadLlmConfig();
    this.client = new OpenAI({ apiKey: config.openaiApiKey });
    this.model = config.embeddingModel;
    // text-embedding-3-small outputs 1536 dims by default
    this.dimensions = 1536;
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
      });
      // OpenAI returns embeddings in the same order as input
      results.push(...response.data.map((d) => d.embedding));
    }

    return results;
  }
}
