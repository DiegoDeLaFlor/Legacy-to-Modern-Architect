import { Module } from '@nestjs/common';
import { LLM_PROVIDER_TOKEN } from '../../domain/ports/llm-provider.port';
import { EMBEDDING_PROVIDER_TOKEN } from '../../domain/ports/embedding-provider.port';
import { OpenAiLlmAdapter } from './openai-llm.adapter';
import { OpenAiEmbeddingAdapter } from '../embeddings/openai-embedding.adapter';

@Module({
  providers: [
    OpenAiLlmAdapter,
    OpenAiEmbeddingAdapter,
    { provide: LLM_PROVIDER_TOKEN, useExisting: OpenAiLlmAdapter },
    { provide: EMBEDDING_PROVIDER_TOKEN, useExisting: OpenAiEmbeddingAdapter },
  ],
  exports: [LLM_PROVIDER_TOKEN, EMBEDDING_PROVIDER_TOKEN, OpenAiLlmAdapter, OpenAiEmbeddingAdapter],
})
export class LlmModule {}
