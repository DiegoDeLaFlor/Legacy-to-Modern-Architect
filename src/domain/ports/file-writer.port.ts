export interface GeneratedFile {
  relativePath: string;
  content: string;
}

export interface IFileWriter {
  writeFiles(outputDir: string, files: GeneratedFile[]): Promise<void>;
  ensureDir(dirPath: string): Promise<void>;
}

export const FILE_WRITER_TOKEN = 'FILE_WRITER';
