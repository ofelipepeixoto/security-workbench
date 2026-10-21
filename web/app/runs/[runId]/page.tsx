import { WorkbenchPage, type WorkbenchSearch } from "../../../components/workbench-page";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: Promise<WorkbenchSearch> }) {
  const { runId } = await params;
  return <WorkbenchPage view="detail" runId={runId} searchParams={searchParams} />;
}
