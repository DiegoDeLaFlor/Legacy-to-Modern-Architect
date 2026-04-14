import { Module } from '@nestjs/common';
import { VECTOR_STORE_TOKEN } from '../../domain/ports/vector-store.port';
import { PgVectorAdapter } from './pgvector-vectorstore.adapter';

@Module({
  providers: [
    PgVectorAdapter,
    { provide: VECTOR_STORE_TOKEN, useExisting: PgVectorAdapter },
  ],
  exports: [VECTOR_STORE_TOKEN, PgVectorAdapter],
})
export class VectorStoreModule {}
