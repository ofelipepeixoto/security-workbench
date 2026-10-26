import { getWorkbenchAccess } from "../../../../workbench-identity";
import { handleGitHubSessionRequest } from "../../../../../lib/github-session-response.mjs";

export async function GET(request: Request) { return handleGitHubSessionRequest(request, getWorkbenchAccess); }
