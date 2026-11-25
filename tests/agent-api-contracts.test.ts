import { describe, expect, it } from "vitest";
import {
  claimTaskBodySchema,
  completeTaskBodySchema,
  failTaskBodySchema,
  needsHumanTaskBodySchema,
  taskListQuerySchema,
  taskStatusSchema,
  taskTypeSchema,
} from "@/api/agent/v1/contracts";

describe("PIP Agent API contracts", () => {
  it("defaults task pagination safely", () => {
    expect(taskListQuerySchema.parse({})).toEqual({ limit: 50, cursor: 0 });
    expect(taskListQuerySchema.safeParse({ limit: 5000 }).success).toBe(false);
  });

  it("accepts bounded task types and statuses only", () => {
    expect(taskTypeSchema.safeParse("report").success).toBe(true);
    expect(taskTypeSchema.safeParse("execute-payment").success).toBe(false);
    expect(taskStatusSchema.safeParse("waiting_for_human").success).toBe(true);
  });

  it("uses a bounded lease when claiming work", () => {
    expect(claimTaskBodySchema.parse({ lease_seconds: 1800 }).lease_seconds).toBe(1800);
    expect(claimTaskBodySchema.safeParse({ lease_seconds: 20 }).success).toBe(false);
  });

  it("requires a JSON object result for completion", () => {
    expect(completeTaskBodySchema.safeParse({ result: { ok: true } }).success).toBe(true);
    expect(completeTaskBodySchema.safeParse({}).success).toBe(false);
  });

  it("defaults failure to retryable but bounds the reason", () => {
    expect(failTaskBodySchema.parse({ reason: "temporary" }).retryable).toBe(true);
    expect(failTaskBodySchema.safeParse({ reason: "x".repeat(2001) }).success).toBe(false);
  });

  it("only accepts Telegram or web for human escalation", () => {
    expect(needsHumanTaskBodySchema.safeParse({ question: "Need approval", channel: "web" }).success).toBe(true);
    expect(needsHumanTaskBodySchema.safeParse({ question: "Need approval", channel: "email" }).success).toBe(false);
  });
});
