export interface ModuleBoundary {
  name: string;
  /** Source file paths that belong to this module */
  sourcePaths: string[];
  /** Other module names this depends on */
  dependencies: string[];
  /** Domain concepts this module handles */
  concepts: string[];
}
