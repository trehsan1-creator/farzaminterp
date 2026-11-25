import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, hasDatabaseConfig } from "@/lib/env";
import { getServiceClient } from "@/lib/supabase/server";
import { requireAgentApiKey, type AgentAuth, type AgentScope } from "./auth";
import { writeAgentAudit } from "./audit";
import {
  claimTaskBodySchema,
  completeTaskBodySchema,
  failTaskBodySchema,
  heartbeatTaskBodySchema,
  idempotencyKeySchema,
  needsHumanTaskBodySchema,
  releaseTaskBodySchema,
  taskIdSchema,
  taskListQuerySchema,
} from "./contracts";

interface AgentContext {
  client: SupabaseClient;
  auth: AgentAuth;
  companyId: string;
  requestId: string;
  method: string;
  route: string;
}

type Prepared =
  | { ok: true; context: AgentContext }
  | { ok: false; response: NextResponse };

function apiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

async function prepare(
  request: Request,
  scope: AgentScope,
  attemptedAction: string,
  route: string,
): Promise<Prepared> {
  const requestId = randomUUID();
  const authResult = requireAgentApiKey(request, scope);
  if (!authResult.ok) {
    if (hasDatabaseConfig()) {
      await writeAgentAudit({
        actorType: "anonymous",
        requestId,
        action: "auth.denied",
        method: request.method,
        route,
        statusCode: authResult.response.status,
        details: { required_scope: scope, attempted_action: attemptedAction },
      });
    }
    return { ok: false, response: authResult.response };
  }

  if (!hasDatabaseConfig()) {
    return {
      ok: false,
      response: apiError("NOT_CONFIGURED", "Database is not configured.", 503, { request_id: requestId }),
    };
  }
  const client = getServiceClient();
  if (!client) {
    return {
      ok: false,
      response: apiError("NOT_CONFIGURED", "Database is not configured.", 503, { request_id: requestId }),
    };
  }

  const env = getServerEnv();
  let companyId = env.agentCompanyId;
  if (companyId) {
    const { data, error } = await client
      .from("companies")
      .select("id")
      .eq("id", companyId)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) {
      return {
        ok: false,
        response: apiError("AGENT_COMPANY_SCOPE_INVALID", "The configured agent company scope is unavailable.", 503, { request_id: requestId }),
      };
    }
  } else {
    const { data, error } = await client
      .from("companies")
      .select("id")
      .eq("status", "active")
      .limit(2);
    if (error) {
      return {
        ok: false,
        response: apiError("DATABASE_UNAVAILABLE", "Could not resolve the agent company scope.", 503, { request_id: requestId }),
      };
    }
    if (!data || data.length !== 1) {
      return {
        ok: false,
        response: apiError("AGENT_COMPANY_SCOPE_REQUIRED", "Set AGENT_COMPANY_ID when more than one active company exists.", 409, { request_id: requestId }),
      };
    }
    companyId = data[0].id as string;
  }

  if (!companyId) {
    return {
      ok: false,
      response: apiError("AGENT_COMPANY_SCOPE_REQUIRED", "An active company scope is required.", 409, { request_id: requestId }),
    };
  }

  return {
    ok: true,
    context: {
      client,
      auth: authResult.auth,
      companyId,
      requestId,
      method: request.method,
      route,
    },
  };
}

async function audit(
  context: AgentContext,
  action: string,
  statusCode: number,
  options: {
    targetId?: string;
    fiscalYearId?: string | null;
    idempotencyKey?: string | null;
    details?: Record<string, unknown>;
  } = {},
): Promise<boolean> {
  return writeAgentAudit({
    companyId: context.companyId,
    fiscalYearId: options.fiscalYearId ?? null,
    actorType: "agent",
    actorId: context.auth.agentId,
    actorKeyId: context.auth.keyId,
    requestId: context.requestId,
    action,
    method: context.method,
    route: context.route,
    statusCode,
    targetType: options.targetId ? "agent_task" : null,
    targetId: options.targetId ?? null,
    idempotencyKey: options.idempotencyKey ?? null,
    details: options.details ?? {},
  });
}

function auditFailure(requestId: string): NextResponse {
  return apiError(
    "AUDIT_WRITE_FAILED",
    "The request was processed but its audit receipt could not be stored. Retry only with the same idempotency key.",
    503,
    { request_id: requestId },
  );
}

async function getTaskState(context: AgentContext, taskId: string) {
  const { data, error } = await context.client
    .from("agent_tasks")
    .select("id,fiscal_year_id,type,title,status,claimed_by,claimed_at,lease_expires_at,attempt_count,max_attempts,next_attempt_at")
    .eq("id", taskId)
    .eq("company_id", context.companyId)
    .maybeSingle();
  return { data, error };
}

function rpcErrorResponse(error: { message?: string }): NextResponse {
  const message = error.message ?? "";
  const match = message.match(/(TASK_[A-Z_]+|IDEMPOTENCY_KEY_REQUIRED|AGENT_ID_REQUIRED|TASK_RESULT_INVALID|HUMAN_QUESTION_REQUIRED|INVALID_HUMAN_CHANNEL)/);
  const code = match?.[1] ?? "INTERNAL";
  const status =
    code === "TASK_NOT_FOUND" ? 404 :
    code === "TASK_NOT_OWNED" ? 409 :
    code === "IDEMPOTENCY_KEY_REQUIRED" || code === "TASK_RESULT_INVALID" ||
    code === "AGENT_ID_REQUIRED" || code === "HUMAN_QUESTION_REQUIRED" ||
    code === "INVALID_HUMAN_CHANNEL" ? 422 : 500;
  const publicMessage =
    code === "TASK_NOT_FOUND" ? "Task was not found." :
    code === "TASK_NOT_OWNED" ? "The task is not owned by this agent or its lease has expired." :
    code === "IDEMPOTENCY_KEY_REQUIRED" ? "A valid Idempotency-Key header is required." :
    code === "TASK_RESULT_INVALID" ? "The task result must be a JSON object." :
    code === "AGENT_ID_REQUIRED" ? "Agent identity is required." :
    code === "HUMAN_QUESTION_REQUIRED" ? "A human question is required." :
    code === "INVALID_HUMAN_CHANNEL" ? "The human channel is invalid." :
    "The agent task operation failed.";
  return apiError(code, publicMessage, status);
}

async function parseJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const raw = await request.text();
  if (!raw.trim()) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, response: apiError("VALIDATION_FAILED", "Invalid JSON body.", 400) };
  }
}

export async function handleHealth(request: Request): Promise<NextResponse> {
  const prepared = await prepare(request, "tasks:read", "health.read", "/api/agent/v1/health");
  if (!prepared.ok) return prepared.response;
  const context = prepared.context;

  const { data: company, error: companyError } = await context.client
    .from("companies")
    .select("id")
    .eq("id", context.companyId)
    .maybeSingle();
  const { count, error: queueError } = await context.client
    .from("agent_tasks")
    .select("id", { count: "exact", head: true })
    .eq("company_id", context.companyId)
    .eq("status", "open");

  if (companyError || queueError || !company) {
    const response = apiError("DATABASE_UNAVAILABLE", "The database health check failed.", 503, { request_id: context.requestId });
    await audit(context, "health.failed", 503, { details: { database: false } });
    return response;
  }

  const body = {
    ok: true,
    app: "farzam-erp",
    database: true,
    queue_depth: count ?? 0,
    time: new Date().toISOString(),
  };
  if (!(await audit(context, "health.read", 200, { details: { queue_depth: count ?? 0 } }))) {
    return auditFailure(context.requestId);
  }
  return NextResponse.json(body);
}

export async function handleListTasks(request: Request): Promise<NextResponse> {
  const prepared = await prepare(request, "tasks:read", "tasks.list", "/api/agent/v1/tasks");
  if (!prepared.ok) return prepared.response;
  const context = prepared.context;
  const url = new URL(request.url);
  const parsed = taskListQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) {
    const response = apiError("VALIDATION_FAILED", "Invalid task-list filters.", 400, { issues: parsed.error.issues });
    await audit(context, "tasks.list.invalid", 400);
    return response;
  }

  const { status, type, limit, cursor } = parsed.data;
  let query = context.client
    .from("agent_tasks")
    .select("id,type,title,payload,priority,due_at,created_at,status,claimed_by,lease_expires_at,attempt_count,max_attempts,next_attempt_at,fiscal_year_id")
    .eq("company_id", context.companyId);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("type", type);

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .order("priority", { ascending: false })
    .order("id", { ascending: true })
    .range(cursor, cursor + limit);

  if (error) {
    const response = apiError("INTERNAL", "Could not read the task queue.", 500, { request_id: context.requestId });
    await audit(context, "tasks.list.failed", 500, { details: { db_code: error.code } });
    return response;
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const tasks = hasMore ? rows.slice(0, limit) : rows;
  if (!(await audit(context, "tasks.list", 200, {
    details: { count: tasks.length, status: status ?? null, type: type ?? null },
  }))) return auditFailure(context.requestId);

  return NextResponse.json({
    tasks,
    next_cursor: hasMore ? String(cursor + limit) : null,
  });
}

export async function handleListAudit(request: Request): Promise<NextResponse> {
  const prepared = await prepare(request, "audit:read", "audit.list", "/api/agent/v1/audit");
  if (!prepared.ok) return prepared.response;
  const context = prepared.context;
  const rawLimit = new URL(request.url).searchParams.get("limit");
  const limit = rawLimit === null ? 100 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    const response = apiError("VALIDATION_FAILED", "limit must be an integer from 1 to 200.", 400);
    await audit(context, "audit.list.invalid", 400);
    return response;
  }

  const { data, error } = await context.client
    .from("agent_audit_log")
    .select("id,request_id,action,actor_type,actor_id,actor_key_id,http_method,route,status_code,target_type,target_id,idempotency_key,details,created_at")
    .eq("company_id", context.companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const response = apiError("INTERNAL", "Could not read the agent audit log.", 500, { request_id: context.requestId });
    await audit(context, "audit.list.failed", 500, { details: { db_code: error.code } });
    return response;
  }
  if (!(await audit(context, "audit.list", 200, { details: { count: data?.length ?? 0 } }))) {
    return auditFailure(context.requestId);
  }
  return NextResponse.json({ audit_events: data ?? [] });
}

export type TaskAction = "claim" | "heartbeat" | "release" | "complete" | "fail" | "needs-human";

export async function handleTaskAction(
  request: Request,
  rawTaskId: string,
  action: TaskAction,
): Promise<NextResponse> {
  const route = "/api/agent/v1/tasks/" + rawTaskId + "/" + action;
  const prepared = await prepare(request, "tasks:write", "task." + action, route);
  if (!prepared.ok) return prepared.response;
  const context = prepared.context;

  const parsedId = taskIdSchema.safeParse(rawTaskId);
  if (!parsedId.success) {
    const response = apiError("VALIDATION_FAILED", "Task id must be a UUID.", 400);
    await audit(context, "task." + action + ".invalid_id", 400);
    return response;
  }
  const taskId = parsedId.data;

  const parsedBody = await parseJson(request);
  if (!parsedBody.ok) {
    await audit(context, "task." + action + ".invalid_json", 400, { targetId: taskId });
    return parsedBody.response;
  }

  const { data: task, error: taskError } = await getTaskState(context, taskId);
  if (taskError) {
    const response = apiError("INTERNAL", "Could not resolve task scope.", 500);
    await audit(context, "task." + action + ".scope_failed", 500, { targetId: taskId, details: { db_code: taskError.code } });
    return response;
  }
  if (!task) {
    const response = apiError("TASK_NOT_FOUND", "Task was not found in the agent's company scope.", 404);
    await audit(context, "task." + action + ".not_found", 404, { targetId: taskId });
    return response;
  }

  const key = request.headers.get("idempotency-key");
  let rpcName: string;
  let rpcArgs: Record<string, unknown>;
  let auditDetails: Record<string, unknown> = {};

  if (action === "claim") {
    const parsed = claimTaskBodySchema.safeParse(parsedBody.value);
    if (!parsed.success) {
      const response = apiError("VALIDATION_FAILED", "Invalid claim body.", 400, { issues: parsed.error.issues });
      await audit(context, "task.claim.invalid", 400, { targetId: taskId, fiscalYearId: task.fiscal_year_id });
      return response;
    }
    if (task.status === "in_progress" && task.claimed_by === context.auth.agentId &&
        task.lease_expires_at && new Date(task.lease_expires_at).getTime() > Date.now()) {
      const response = NextResponse.json(task);
      if (!(await audit(context, "task.claim.repeated", 200, { targetId: taskId, fiscalYearId: task.fiscal_year_id }))) {
        return auditFailure(context.requestId);
      }
      return response;
    }
    rpcName = "fz_agent_claim_task";
    rpcArgs = {
      p_task_id: taskId,
      p_agent: context.auth.agentId,
      p_lease_seconds: parsed.data.lease_seconds ?? 1800,
    };
  } else if (action === "heartbeat") {
    const parsed = heartbeatTaskBodySchema.safeParse(parsedBody.value);
    if (!parsed.success) {
      const response = apiError("VALIDATION_FAILED", "Invalid heartbeat body.", 400, { issues: parsed.error.issues });
      await audit(context, "task.heartbeat.invalid", 400, { targetId: taskId, fiscalYearId: task.fiscal_year_id });
      return response;
    }
    rpcName = "fz_agent_heartbeat_task";
    rpcArgs = {
      p_task_id: taskId,
      p_agent: context.auth.agentId,
      p_lease_seconds: parsed.data.lease_seconds ?? 1800,
    };
  } else if (action === "release") {
    const parsed = releaseTaskBodySchema.safeParse(parsedBody.value);
    if (!parsed.success) {
      const response = apiError("VALIDATION_FAILED", "Invalid release body.", 400, { issues: parsed.error.issues });
      await audit(context, "task.release.invalid", 400, { targetId: taskId, fiscalYearId: task.fiscal_year_id });
      return response;
    }
    rpcName = "fz_agent_release_task";
    rpcArgs = { p_task_id: taskId, p_agent: context.auth.agentId };
    auditDetails = { reason_length: parsed.data.reason.length };
  } else if (action === "complete") {
    const parsed = completeTaskBodySchema.safeParse(parsedBody.value);
    const parsedKey = idempotencyKeySchema.safeParse(key);
    if (!parsed.success || !parsedKey.success) {
      const response = apiError("VALIDATION_FAILED", "A valid body and Idempotency-Key header are required.", 400, {
        issues: parsed.success ? [] : parsed.error.issues,
      });
      await audit(context, "task.complete.invalid", 400, { targetId: taskId, fiscalYearId: task.fiscal_year_id });
      return response;
    }
    rpcName = "fz_agent_complete_task";
    rpcArgs = {
      p_task_id: taskId,
      p_agent: context.auth.agentId,
      p_idempotency_key: parsedKey.data,
      p_result: parsed.data.result,
      p_summary: parsed.data.summary ?? null,
      p_artifacts: parsed.data.artifacts,
    };
  } else if (action === "fail") {
    const parsed = failTaskBodySchema.safeParse(parsedBody.value);
    const parsedKey = idempotencyKeySchema.safeParse(key);
    if (!parsed.success || !parsedKey.success) {
      const response = apiError("VALIDATION_FAILED", "A valid body and Idempotency-Key header are required.", 400, {
        issues: parsed.success ? [] : parsed.error.issues,
      });
      await audit(context, "task.fail.invalid", 400, { targetId: taskId, fiscalYearId: task.fiscal_year_id });
      return response;
    }
    rpcName = "fz_agent_fail_task";
    rpcArgs = {
      p_task_id: taskId,
      p_agent: context.auth.agentId,
      p_idempotency_key: parsedKey.data,
      p_reason: parsed.data.reason,
      p_retryable: parsed.data.retryable,
      p_error_code: parsed.data.error_code ?? null,
    };
    auditDetails = { retryable: parsed.data.retryable, error_code: parsed.data.error_code ?? null };
  } else {
    const parsed = needsHumanTaskBodySchema.safeParse(parsedBody.value);
    const parsedKey = key ? idempotencyKeySchema.safeParse(key) : null;
    if (!parsed.success || (parsedKey && !parsedKey.success)) {
      const response = apiError("VALIDATION_FAILED", "Invalid needs-human body or Idempotency-Key.", 400, {
        issues: parsed.success ? [] : parsed.error.issues,
      });
      await audit(context, "task.needs_human.invalid", 400, { targetId: taskId, fiscalYearId: task.fiscal_year_id });
      return response;
    }
    rpcName = "fz_agent_needs_human_task";
    rpcArgs = {
      p_task_id: taskId,
      p_agent: context.auth.agentId,
      p_question: parsed.data.question,
      p_channel: parsed.data.channel,
      p_context: parsed.data.context,
      p_idempotency_key: parsedKey?.success ? parsedKey.data : null,
    };
    auditDetails = { channel: parsed.data.channel };
  }

  const { data, error } = await (context.client as any).rpc(rpcName, rpcArgs);
  if (error) {
    const response = rpcErrorResponse(error);
    await audit(context, "task." + action + ".failed", response.status, {
      targetId: taskId,
      fiscalYearId: task.fiscal_year_id,
      idempotencyKey: key,
      details: { db_code: error.code, response_status: response.status },
    });
    return response;
  }

  if (data === null) {
    const { data: current } = await getTaskState(context, taskId);
    const response = apiError("TASK_NOT_CLAIMABLE", "Task state or lease does not allow this operation.", 409, {
      current_state: current ?? null,
    });
    await audit(context, "task." + action + ".conflict", 409, {
      targetId: taskId,
      fiscalYearId: task.fiscal_year_id,
      idempotencyKey: key,
    });
    return response;
  }

  const response = NextResponse.json(data);
  if (!(await audit(context, "task." + action, 200, {
    targetId: taskId,
    fiscalYearId: task.fiscal_year_id,
    idempotencyKey: key,
    details: auditDetails,
  }))) return auditFailure(context.requestId);
  return response;
}
