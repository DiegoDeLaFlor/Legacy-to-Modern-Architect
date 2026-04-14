export interface LlmConfig {
  openaiApiKey: string;
  model: string;
  embeddingModel: string;
  maxTokens: number;
  temperature: number;
}

export function loadLlmConfig(): LlmConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is required');

  return {
    openaiApiKey: apiKey,
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS ?? '4096', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE ?? '0.2'),
  };
}
