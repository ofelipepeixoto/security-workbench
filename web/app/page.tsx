import Workbench from "./workbench";
import { getWorkbenchAccess } from "./workbench-identity";
export const dynamic = "force-dynamic";
export default async function Home() {
  const access = await getWorkbenchAccess();
  return <Workbench signedIn={Boolean(access.user)} name={access.user?.displayName || "Visitante"} githubReady={access.githubReady} csrfToken={access.user?.csrfToken || ""} />;
}
