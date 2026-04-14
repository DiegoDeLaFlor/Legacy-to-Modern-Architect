import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ILlmProvider, LlmMessage, LlmCallOptions } from '../../domain/ports/llm-provider.port';
import { loadLlmConfig } from '../../config/llm.config';

@Injectable()
export class OpenAiLlmAdapter implements ILlmProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly defaultMaxTokens: number;
  private readonly defaultTemperature: number;

  constructor() {
    const config = loadLlmConfig();
    this.client = new OpenAI({ apiKey: config.openaiApiKey });
    this.model = config.model;
    this.defaultMaxTokens = config.maxTokens;
    this.defaultTemperature = config.temperature;
  }

  async call(messages: LlmMessage[], options?: LlmCallOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      temperature: options?.temperature ?? this.defaultTemperature,
      response_format: options?.jsonMode ? { type: 'json_object' } : { type: 'text' },
    });

    return response.choices[0]?.message?.content ?? '';
  }

  countTokens(text: string): number {
    // Approximation: 1 token ≈ 4 characters for English/code
    return Math.ceil(text.length / 4);
  }
}
