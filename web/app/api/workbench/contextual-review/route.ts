import {env} from "cloudflare:workers";
import {getWorkbenchAccess, githubConfig} from "../../../workbench-identity";
import {githubAppAuth} from "../../../github-app";
import {handleWorkbenchRequest} from "../../../../lib/workbench-service.mjs";
import {contextualRuntime} from "../../../../lib/contextual-review-workbench.mjs";

async function handle(request:Request) {
  return handleWorkbenchRequest(request, {
    authorizedOwnerId:env.WORKBENCH_OWNER_ID, accessPolicy:githubConfig(), getDb:()=>env.DB,
    getUser:async()=>(await getWorkbenchAccess(request)).user,
    githubApp:githubAppAuth(), contextual:contextualRuntime(env),
  }, {contextualOnly:true});
}
export const GET=handle;
export const POST=handle;
