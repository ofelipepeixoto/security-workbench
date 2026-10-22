import { WorkbenchPage, type WorkbenchSearch } from "../../components/workbench-page";

export const dynamic = "force-dynamic";
export default function RepositoriesPage({ searchParams }: { searchParams: Promise<WorkbenchSearch> }) {
  return <WorkbenchPage view="repositories" searchParams={searchParams} />;
}
