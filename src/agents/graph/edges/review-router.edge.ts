import { MigrationState } from '../migration-state';

export type ReviewRouteResult = 'pass' | 'retry' | 'fail';

export function reviewRouter(state: MigrationState): ReviewRouteResult {
  const criticalFindings = state.reviewFindings.filter((f) => f.isCritical);

  if (criticalFindings.length === 0) {
    return 'pass';
  }

  if (state.retryCount < state.maxRetries) {
    return 'retry';
  }

  return 'fail';
}
