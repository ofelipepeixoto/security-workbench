"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { Run, Project } from "./workbench-types";

export const demoProject: Project = { id: "example-project", repo: "ofelipepeixoto/exemplo-autorizado", repository_id: 100, authorized_at: "2026-10-17T12:00:00Z" };
export const demoRun: Run = {
  id: "example-run", project_id: demoProject.id, repo: demoProject.repo, repository_id: 100,
  status: "complete", revision: "a".repeat(40), created_at: "2026-10-17T12:05:00Z", files_read: 12, bytes_read: 18320, partial: true,
  digest: "Exemplo fictício, sem aquisição real.", omissions: ["Exemplo limitado a um conjunto fictício de arquivos."], findings_count: 2,
  dependencies: [{ name: "example-package", version: "1.2.3", source: "package.json" }], findings: [
    { fingerprint: "example-secret", kind: "possible-secret", path: "src/config.ts", line: 18, status: "candidate", confidence: "medium", evidence: "Atribuição a api_key com valor [REDACTED] em src/config.ts:18.", impact: "Uma credencial real exposta pode permitir acesso indevido. A validade não foi verificada.", recommendation: "Revisar o valor fora do relatório. Se for real, revogar e remover com procedimento controlado." },
    { fingerprint: "example-workflow", kind: "broad-workflow-permissions", path: ".github/workflows/ci.yml", line: 6, status: "candidate", confidence: "high", evidence: "Declaração permissions: write-all em .github/workflows/ci.yml:6.", impact: "Um workflow comprometido pode receber permissões amplas, conforme seu gatilho e contexto.", recommendation: "Revisar o gatilho e conceder apenas as permissões específicas necessárias." },
  ],
};
const initialRuns: Run[] = [demoRun, { ...demoRun, id: "example-before", revision: "b".repeat(40), created_at: "2026-10-17T12:01:00Z", findings: [demoRun.findings![1]], findings_count: 1 }];
const initialSnapshot = JSON.stringify(initialRuns);
const key = "security-workbench:fictional-demo:v1";
let memorySnapshot = initialSnapshot;

function snapshot() {
  try { return window.sessionStorage.getItem(key) || memorySnapshot; }
  catch { return memorySnapshot; }
}
function parse(value: string): Run[] {
  try {
    if (value.length > 200000) return initialRuns;
    const result = JSON.parse(value) as Run[];
    // Only this fixed fictitious repository and known fixture findings can enter this store.
    if (!Array.isArray(result) || result.length > 20 || result.some(run => !run.id?.startsWith("example-") || run.repo !== demoProject.repo || run.project_id !== demoProject.id || !Array.isArray(run.findings) || run.findings.some(finding => !["example-secret", "example-workflow"].includes(finding.fingerprint)))) return initialRuns;
    return result.map(run => {
      const findings = run.findings!.map(item => ({ ...demoRun.findings!.find(finding => finding.fingerprint === item.fingerprint)!, status: ["candidate", "confirmed", "false_positive", "accepted_risk"].includes(item.status) ? item.status : "candidate" }));
      return { ...demoRun, id: /^example-[a-zA-Z0-9-]{1,80}$/.test(run.id) ? run.id : demoRun.id, created_at: typeof run.created_at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(run.created_at) && !Number.isNaN(Date.parse(run.created_at)) ? run.created_at : demoRun.created_at, revision: typeof run.revision === "string" && /^[a-f0-9]{40}$/i.test(run.revision) ? run.revision : demoRun.revision, findings, findings_count: findings.length };
    });
  } catch { return initialRuns; }
}
function subscribe(listener: () => void) {
  window.addEventListener("workbench-demo-change", listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener("workbench-demo-change", listener); window.removeEventListener("storage", listener); };
}
export function useDemoHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
export function useDemoRuns() {
  const value = useSyncExternalStore(subscribe, snapshot, () => initialSnapshot);
  return useMemo(() => parse(value), [value]);
}
export function updateDemoRuns(update: (current: Run[]) => Run[], requirePersistence = false) {
  const next = JSON.stringify(update(parse(snapshot())).slice(0, 20));
  let persisted = true;
  try { window.sessionStorage.setItem(key, next); }
  catch { if (requirePersistence) return false; persisted = false; }
  memorySnapshot = next;
  window.dispatchEvent(new Event("workbench-demo-change"));
  return persisted;
}
export function resetDemo() {
  memorySnapshot = initialSnapshot;
  try { window.sessionStorage.removeItem(key); } catch { /* No real data is stored here. */ }
  window.dispatchEvent(new Event("workbench-demo-change"));
}
