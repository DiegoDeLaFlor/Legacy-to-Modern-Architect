export interface LlmConfig {
  openaiApiKey: string;
  /** Primary model for planning and code generation */
  model: string;
  /** Light model for code parsing — higher rate limits, lower cost */
  parserModel: string;
  embeddingModel: string;
  /** Default max tokens for planner and reviewer calls */
  maxTokens: number;
  /**
   * Max tokens reserved exclusively for the code generator.
   * Must be high enough to fit a full Nest.js module in one response.
   * gpt-4o cap: 16 384 — gpt-4.1 cap: 32 768.
   */
  generatorMaxTokens: number;
  temperature: number;
}

export function loadLlmConfig(): LlmConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is required');

  return {
    openaiApiKey: apiKey,
    model: process.env.OPENAI_MODEL ?? 'gpt-4.1',
    parserModel: process.env.OPENAI_PARSER_MODEL ?? 'gpt-4.1-mini',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS ?? '4096', 10),
    generatorMaxTokens: parseInt(process.env.GENERATOR_MAX_TOKENS ?? '16000', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE ?? '0.2'),
  };
}
