import Workbench from "./workbench";
import { getChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  return <Workbench signedIn={Boolean(user)} name={user?.fullName || "Radar"} />;
}
