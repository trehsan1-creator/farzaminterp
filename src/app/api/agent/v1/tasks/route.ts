import { handleListTasks } from "@/api/agent/v1/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleListTasks(request);
}
