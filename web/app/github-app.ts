import { env } from "cloudflare:workers";
import { createGitHubAppAuth } from "../lib/github-app-auth.mjs";
import { getWorkbenchAccess } from "./workbench-identity";

export function githubAppConfig() {
  return {
    enabled: env.GITHUB_APP_ENABLED === "true" && env.WORKBENCH_MULTIUSER_ENABLED === "true",
    origin: env.WORKBENCH_ORIGIN || "",
    appId: env.GITHUB_APP_ID || "",
    slug: env.GITHUB_APP_SLUG || "",
    clientId: env.GITHUB_APP_CLIENT_ID || "",
    clientSecret: env.GITHUB_APP_CLIENT_SECRET || "",
    encryptionKey: env.GITHUB_APP_TOKEN_KEY || "",
    keyVersion: env.GITHUB_APP_KEY_VERSION || "1",
  };
}

export function githubAppAuth() {
  return createGitHubAppAuth({
    config: githubAppConfig(), db: env.DB,
    getUser: async (request: Request) => (await getWorkbenchAccess(request)).user,
  });
}
