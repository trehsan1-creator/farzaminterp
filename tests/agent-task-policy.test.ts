import { describe, expect, it } from "vitest";
import {
  clampLeaseSeconds,
  DEFAULT_LEASE_SECONDS,
  retryDelayMinutes,
  shouldRetry,
} from "@/modules/agent/task-policy";

describe("agent task policy", () => {
  it("uses a 30-minute lease by default", () => {
    expect(clampLeaseSeconds()).toBe(DEFAULT_LEASE_SECONDS);
  });

  it("clamps leases to the supported 60-second to 1-hour range", () => {
    expect(clampLeaseSeconds(10)).toBe(60);
    expect(clampLeaseSeconds(1800)).toBe(1800);
    expect(clampLeaseSeconds(9000)).toBe(3600);
  });

  it("uses exponential retry backoff capped at 60 minutes", () => {
    expect(retryDelayMinutes(1)).toBe(2);
    expect(retryDelayMinutes(2)).toBe(4);
    expect(retryDelayMinutes(6)).toBe(60);
    expect(retryDelayMinutes(12)).toBe(60);
  });

  it("never retries permanent failures or exhausted attempts", () => {
    expect(shouldRetry(false, 1, 3)).toBe(false);
    expect(shouldRetry(true, 2, 3)).toBe(true);
    expect(shouldRetry(true, 3, 3)).toBe(false);
  });
});
