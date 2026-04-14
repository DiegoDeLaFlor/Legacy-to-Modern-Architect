import { Module } from '@nestjs/common';
import { AgentsModule } from './agents/agents.module';
import { MigrationController } from './interfaces/api/migration.controller';
import { HealthController } from './interfaces/api/health.controller';
import { FileWriterAdapter } from './infrastructure/filesystem/file-writer.adapter';
import { FILE_WRITER_TOKEN } from './domain/ports/file-writer.port';

@Module({
  imports: [AgentsModule],
  controllers: [MigrationController, HealthController],
  providers: [
    FileWriterAdapter,
    { provide: FILE_WRITER_TOKEN, useExisting: FileWriterAdapter },
  ],
})
export class AppModule {}
