import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { resolveWorkbenchIdentity } from "../lib/workbench-access.mjs";
import { createGitHubAuth, isGitHubLoginConfigured } from "../lib/github-auth.mjs";

export function githubConfig() {
  return {
    enabled: env.GITHUB_LOGIN_ENABLED === "true",
    origin: env.WORKBENCH_ORIGIN || "",
    clientId: env.GITHUB_LOGIN_CLIENT_ID || "",
    clientSecret: env.GITHUB_LOGIN_CLIENT_SECRET || "",
    githubOwnerId: env.GITHUB_OWNER_ID || "",
    workbenchOwnerId: env.WORKBENCH_OWNER_ID || "",
    sessionVersion: env.GITHUB_SESSION_VERSION || "1",
  };
}

export function githubAuth() {
  return createGitHubAuth({ config: githubConfig(), db: env.DB });
}

export async function getWorkbenchAccess(request?: Request) {
  const config = githubConfig();
  const githubReady = isGitHubLoginConfigured(config);
  const source = request ?? new Request(githubReady ? config.origin : "https://unconfigured.invalid", { headers: { cookie: githubReady ? (await headers()).get("cookie") || "" : "" } });
  const user = await resolveWorkbenchIdentity({ config, request: source, getGitHubSession: (source: Request) => githubAuth().getSession(source) });
  return { user, provider: user ? "github" as const : "anonymous" as const, githubReady };
}
