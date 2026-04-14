export interface IRepositorySource {
  /** Clone or access the repository and return the local workspace path */
  prepare(source: string): Promise<string>;
  /** Clean up the workspace after migration */
  cleanup(workspacePath: string): Promise<void>;
}

export const REPOSITORY_SOURCE_TOKEN = 'REPOSITORY_SOURCE';
