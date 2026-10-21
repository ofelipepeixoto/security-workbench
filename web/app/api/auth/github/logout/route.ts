import { githubAuth } from "../../../../workbench-identity";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return githubAuth().logout(request); }
