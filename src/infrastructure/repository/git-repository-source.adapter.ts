import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { simpleGit } from 'simple-git';
import { IRepositorySource } from '../../domain/ports/repository-source.port';
import { loadAppConfig } from '../../config/app.config';

@Injectable()
export class GitRepositorySourceAdapter implements IRepositorySource {
  private readonly logger = new Logger(GitRepositorySourceAdapter.name);

  async prepare(source: string): Promise<string> {
    const config = loadAppConfig();
    const isGitUrl = source.startsWith('http') || source.startsWith('git@');

    if (!isGitUrl) {
      // Local path — validate and return as-is
      try {
        await fs.access(source);
        this.logger.log(`Using local repository: ${source}`);
        return source;
      } catch {
        throw new Error(`Local repository path not found: ${source}`);
      }
    }

    // Remote — clone into workspace
    const repoName = path.basename(source.replace(/\.git$/, ''));
    const targetPath = path.join(config.workspaceDir, repoName);

    await fs.mkdir(config.workspaceDir, { recursive: true });

    try {
      await fs.access(targetPath);
      this.logger.log(`Workspace already exists, pulling latest: ${targetPath}`);
      const git = simpleGit(targetPath);
      await git.pull();
    } catch {
      this.logger.log(`Cloning ${source} → ${targetPath}`);
      await simpleGit().clone(source, targetPath, ['--depth', '1']);
    }

    return targetPath;
  }

  async cleanup(workspacePath: string): Promise<void> {
    const config = loadAppConfig();
    if (workspacePath.startsWith(path.resolve(config.workspaceDir))) {
      await fs.rm(workspacePath, { recursive: true, force: true });
      this.logger.log(`Cleaned workspace: ${workspacePath}`);
    }
  }
}
