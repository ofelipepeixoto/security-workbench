declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    WORKBENCH_OWNER_ID?: string;
    WORKBENCH_ORIGIN?: string;
    GITHUB_LOGIN_ENABLED?: string;
    GITHUB_LOGIN_CLIENT_ID?: string;
    GITHUB_LOGIN_CLIENT_SECRET?: string;
    GITHUB_OWNER_ID?: string;
    GITHUB_SESSION_VERSION?: string;
    BUCKET?: R2Bucket;
  }
}
