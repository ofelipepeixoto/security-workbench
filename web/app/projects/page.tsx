import { WorkbenchPage, type WorkbenchSearch } from "../../components/workbench-page";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<WorkbenchSearch> }) {
  return <WorkbenchPage view="projects" searchParams={searchParams} />;
}
