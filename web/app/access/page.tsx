import { getWorkbenchAccess } from "../workbench-identity";
import { AccessPanel } from "../access-panel";
export const dynamic = "force-dynamic";
export default async function Access({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const access = await getWorkbenchAccess();
  const query = await searchParams;
  return <AccessPanel signedIn={Boolean(access.user)} name={access.user?.displayName || ""} githubReady={access.githubReady} csrfToken={access.user?.csrfToken || ""} authResult={typeof query.auth === "string" ? query.auth : ""} />;
}
