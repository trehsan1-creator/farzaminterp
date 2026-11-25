import { z } from "zod";

export const taskStatusSchema = z.enum([
  "open",
  "in_progress",
  "waiting_for_human",
  "done",
  "failed",
]);

export const taskTypeSchema = z.enum([
  "reconcile",
  "report",
  "extract",
  "review",
  "notify",
]);

export const taskListQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  type: taskTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.coerce.number().int().min(0).default(0),
});

export const claimTaskBodySchema = z.object({
  agent: z.string().min(1).max(64).optional(),
  lease_seconds: z.coerce.number().int().min(60).max(3600).optional(),
});

export const heartbeatTaskBodySchema = z.object({
  lease_seconds: z.coerce.number().int().min(60).max(3600).optional(),
});

export const releaseTaskBodySchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const completeTaskBodySchema = z.object({
  result: z.record(z.string(), z.unknown()),
  summary: z.string().max(4000).optional(),
  artifacts: z.array(z.object({
    kind: z.string().min(1).max(80),
    ref: z.string().min(1).max(2048),
  })).max(50).default([]),
});

export const failTaskBodySchema = z.object({
  reason: z.string().min(1).max(2000),
  retryable: z.boolean().default(true),
  error_code: z.string().max(100).optional(),
});

export const needsHumanTaskBodySchema = z.object({
  question: z.string().min(1).max(4000),
  channel: z.enum(["telegram", "web"]),
  context: z.record(z.string(), z.unknown()).default({}),
});

export const taskIdSchema = z.string().uuid();
export const idempotencyKeySchema = z.string().min(8).max(200);
