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
    WORKBENCH_MULTIUSER_ENABLED?: string;
    WORKBENCH_PILOT_GITHUB_IDS?: string;
    GITHUB_APP_ENABLED?: string;
    GITHUB_APP_ID?: string;
    GITHUB_APP_SLUG?: string;
    GITHUB_APP_CLIENT_ID?: string;
    GITHUB_APP_CLIENT_SECRET?: string;
    GITHUB_APP_TOKEN_KEY?: string;
    GITHUB_APP_KEY_VERSION?: string;
    WORKBENCH_JOBS_ENABLED?: string;
    WORKBENCH_QA_ENABLED?: string;
    WORKBENCH_QA_METRICS_ENABLED?: string;
    WORKBENCH_CONTEXTUAL_ENABLED?: string;
    WORKBENCH_CONTEXTUAL_DATA_POLICY?: string;
    OPENAI_API_KEY?: string;
    OPENAI_APPROVED_MODEL?: string;
    OPENAI_PROJECT_ID?: string;
    OPENAI_ORGANIZATION_ID?: string;
    ANALYSIS_QUEUE?: Queue<{ jobId: string }>;
    BUCKET?: R2Bucket;
  }
}
