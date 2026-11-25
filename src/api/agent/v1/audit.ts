import { getServiceClient } from "@/lib/supabase/server";

export interface AgentAuditInput {
  companyId?: string | null;
  fiscalYearId?: string | null;
  actorType: "agent" | "human" | "system" | "anonymous";
  actorId?: string | null;
  actorKeyId?: string | null;
  requestId: string;
  action: string;
  method?: string | null;
  route?: string | null;
  statusCode?: number | null;
  targetType?: string | null;
  targetId?: string | null;
  idempotencyKey?: string | null;
  details?: Record<string, unknown>;
}

/** Writes metadata only; never place credentials or full source documents in details. */
export async function writeAgentAudit(input: AgentAuditInput): Promise<boolean> {
  const client = getServiceClient();
  if (!client) return false;

  const { error } = await client.from("agent_audit_log").insert({
    company_id: input.companyId ?? null,
    fiscal_year_id: input.fiscalYearId ?? null,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    actor_key_id: input.actorKeyId ?? null,
    request_id: input.requestId,
    action: input.action,
    http_method: input.method ?? null,
    route: input.route ?? null,
    status_code: input.statusCode ?? null,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    details: input.details ?? {},
  });

  if (error) {
    console.error("[farzam-erp:agent-audit] insert failed", {
      code: error.code,
      message: error.message,
    });
    return false;
  }
  return true;
}
