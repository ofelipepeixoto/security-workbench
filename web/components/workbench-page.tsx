import Workbench from "../app/workbench";
import { getWorkbenchAccess } from "../app/workbench-identity";
import type { Filters, WorkbenchView } from "./workbench-types";

export type WorkbenchSearch = Record<string, string | string[] | undefined>;

export async function WorkbenchPage({ view, runId = "", searchParams }: { view: WorkbenchView; runId?: string; searchParams?: Promise<WorkbenchSearch> }) {
  const access = await getWorkbenchAccess();
  const query = await searchParams || {};
  const value = (key: string) => typeof query[key] === "string" ? query[key].slice(0, 250) : "";
  const filters: Filters = { q: value("q"), project: value("project"), status: value("status"), kind: value("kind"), from: value("from"), to: value("to"), before: value("before"), after: value("after"), run: value("run") };
  return <Workbench initialView={view} initialRunId={runId} initialFilters={filters} demoRequested={value("demo") === "1"} signedIn={Boolean(access.user)} name={access.user?.displayName || "Visitante"} githubReady={access.githubReady} csrfToken={access.user?.csrfToken || ""} />;
}
