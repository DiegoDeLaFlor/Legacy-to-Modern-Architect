export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCallOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface ILlmProvider {
  call(messages: LlmMessage[], options?: LlmCallOptions): Promise<string>;
  /** Returns approximate token count for the given text */
  countTokens(text: string): number;
}

export const LLM_PROVIDER_TOKEN = 'LLM_PROVIDER';
