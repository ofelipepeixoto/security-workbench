import { githubAppAuth } from "../../../../github-app";

export async function GET(request: Request) {
  return githubAppAuth().callback(request);
}
