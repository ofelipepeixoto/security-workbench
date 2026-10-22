import { env } from "cloudflare:workers";
import { getWorkbenchAccess, githubConfig } from "../../workbench-identity";
import { githubAppAuth } from "../../github-app";
import { handleWorkbenchRequest } from "../../../lib/workbench-service.mjs";
import { createQaGuard } from "../../../lib/qa-guard.mjs";

const dependencies = {
  get authorizedOwnerId() { return env.WORKBENCH_OWNER_ID; },
  getDb: () => env.DB,
  get qaGuard() { return createQaGuard({env}); },
  get accessPolicy() { return githubConfig(); },
  get githubApp() { return githubAppAuth(); },
  get jobsEnabled() { return env.WORKBENCH_JOBS_ENABLED === "true" && Boolean(env.ANALYSIS_QUEUE); },
  dispatchJob: async (message: {jobId: string}) => {
    if (!env.ANALYSIS_QUEUE) throw new Error("Analysis dispatcher unavailable");
    await env.ANALYSIS_QUEUE.send(message);
  },
};

export async function GET(request: Request) {
  return handleWorkbenchRequest(request, { ...dependencies, getUser: async () => (await getWorkbenchAccess(request)).user });
}

export async function POST(request: Request) {
  return handleWorkbenchRequest(request, { ...dependencies, getUser: async () => (await getWorkbenchAccess(request)).user });
}
