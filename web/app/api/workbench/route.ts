import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { handleWorkbenchRequest } from "../../../lib/workbench-service.mjs";

const dependencies = {
  getUser: getChatGPTUser,
  getDb: () => env.DB,
};

export async function GET(request: Request) {
  return handleWorkbenchRequest(request, dependencies);
}

export async function POST(request: Request) {
  return handleWorkbenchRequest(request, dependencies);
}
