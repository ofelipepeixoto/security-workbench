import { githubAppAuth } from "../../../../github-app";

export async function POST(request: Request) {
  return githubAppAuth().start(request);
}
