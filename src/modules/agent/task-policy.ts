/** Pure task-queue policy helpers shared by tests and application code. */
export const DEFAULT_LEASE_SECONDS = 1800;
export const MIN_LEASE_SECONDS = 60;
export const MAX_LEASE_SECONDS = 3600;

export function clampLeaseSeconds(requested?: number): number {
  if (!Number.isFinite(requested)) return DEFAULT_LEASE_SECONDS;
  return Math.min(MAX_LEASE_SECONDS, Math.max(MIN_LEASE_SECONDS, Math.trunc(requested as number)));
}

export function retryDelayMinutes(attemptCount: number): number {
  const attempts = Math.max(0, Math.trunc(Number.isFinite(attemptCount) ? attemptCount : 0));
  return Math.min(60, 2 ** attempts);
}

export function shouldRetry(retryable: boolean, attemptCount: number, maxAttempts: number): boolean {
  return retryable && attemptCount < maxAttempts;
}
