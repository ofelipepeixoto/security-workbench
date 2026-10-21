declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    WORKBENCH_OWNER_ID?: string;
    BUCKET?: R2Bucket;
  }
}
