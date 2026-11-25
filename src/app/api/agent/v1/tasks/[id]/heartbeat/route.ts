import { handleTaskAction } from "@/api/agent/v1/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleTaskAction(request, id, "heartbeat");
}
