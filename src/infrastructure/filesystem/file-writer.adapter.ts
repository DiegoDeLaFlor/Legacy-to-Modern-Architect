import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { IFileWriter, GeneratedFile } from '../../domain/ports/file-writer.port';

@Injectable()
export class FileWriterAdapter implements IFileWriter {
  private readonly logger = new Logger(FileWriterAdapter.name);

  async writeFiles(outputDir: string, files: GeneratedFile[]): Promise<void> {
    await this.ensureDir(outputDir);

    for (const file of files) {
      const fullPath = path.join(outputDir, file.relativePath);
      await this.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, file.content, 'utf-8');
    }

    this.logger.log(`Wrote ${files.length} files to ${outputDir}`);
  }

  async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }
}
