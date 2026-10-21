import { env } from "cloudflare:workers";
import Workbench from "./workbench";
import { getChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  return <Workbench signedIn={Boolean(user && env.WORKBENCH_OWNER_ID && user.userId === env.WORKBENCH_OWNER_ID)} name={user?.fullName || "Radar"} />;
}
