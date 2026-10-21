import { env } from "cloudflare:workers";
import { getWorkbenchAccess } from "../../workbench-identity";
import { handleWorkbenchRequest } from "../../../lib/workbench-service.mjs";

const dependencies = {
  get authorizedOwnerId() { return env.WORKBENCH_OWNER_ID; },
  getDb: () => env.DB,
};

export async function GET(request: Request) {
  return handleWorkbenchRequest(request, { ...dependencies, getUser: async () => (await getWorkbenchAccess(request)).user });
}

export async function POST(request: Request) {
  return handleWorkbenchRequest(request, { ...dependencies, getUser: async () => (await getWorkbenchAccess(request)).user });
}
