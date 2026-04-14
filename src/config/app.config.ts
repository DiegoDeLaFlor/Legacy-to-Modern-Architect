export interface AppConfig {
  workspaceDir: string;
  outputDir: string;
  maxRetries: number;
  contextTokenBudget: number;
  parseWorkerConcurrency: number;
}

export function loadAppConfig(): AppConfig {
  return {
    workspaceDir: process.env.WORKSPACE_DIR ?? './workspace',
    outputDir: process.env.OUTPUT_DIR ?? './output',
    maxRetries: parseInt(process.env.MAX_RETRIES ?? '3', 10),
    contextTokenBudget: parseInt(process.env.CONTEXT_TOKEN_BUDGET ?? '12000', 10),
    parseWorkerConcurrency: parseInt(process.env.PARSE_CONCURRENCY ?? '10', 10),
  };
}
