import * as path from 'path';
import { LanguageType, detectLanguageFromExtension } from './language-type.vo';

export class FilePath {
  readonly absolute: string;
  readonly relative: string;
  readonly extension: string;
  readonly language: LanguageType;

  constructor(absolutePath: string, repoRoot: string) {
    this.absolute = absolutePath;
    this.relative = path.relative(repoRoot, absolutePath).replace(/\\/g, '/');
    this.extension = path.extname(absolutePath);
    this.language = detectLanguageFromExtension(this.extension);
  }

  get fileName(): string {
    return path.basename(this.absolute);
  }

  get directory(): string {
    return path.dirname(this.relative).replace(/\\/g, '/');
  }
}
