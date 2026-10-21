import { githubAuth } from "../../../../workbench-identity";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return githubAuth().callback(request); }
