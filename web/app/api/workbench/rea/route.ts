import { env } from "cloudflare:workers";
import { getWorkbenchAccess, githubConfig } from "../../../workbench-identity";
import { githubAppAuth } from "../../../github-app";
import { handleReaImportRequest } from "../../../../lib/workbench-service.mjs";
import { createQaGuard } from "../../../../lib/qa-guard.mjs";

export async function POST(request: Request) {
  return handleReaImportRequest(request, {
    authorizedOwnerId: env.WORKBENCH_OWNER_ID,
    getDb: () => env.DB,
    qaGuard: createQaGuard({env}),
    getUser: async () => (await getWorkbenchAccess(request)).user,
    accessPolicy: githubConfig(),
    githubApp: githubAppAuth(),
  });
}
