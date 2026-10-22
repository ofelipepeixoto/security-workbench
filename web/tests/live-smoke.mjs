/** Explicit CI-only, credential-free smoke against the owner's public REA commit.
 * Run separately from unit tests: node tests/live-smoke.mjs
 * Prints counters and hashes only; never emits target source or report contents.
 */
import assert from "node:assert/strict";
import {inspectGitHub, SCANNER_LIMITS} from "../lib/scanner.mjs";
import {createSmokeDiagnostics} from './live-smoke-diagnostics.mjs';

const EXPECTED_CI_REPOSITORY = "ofelipepeixoto/security-workbench";
const REPOSITORY = "ofelipepeixoto/rea";
const REPOSITORY_ID = 1417322346;
const REVISION = "3e7c6302233ecbcb9b92e43ee5a60337738961bd";

if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REPOSITORY !== EXPECTED_CI_REPOSITORY) {
  console.error(JSON.stringify({status: "blocked", reason: "Execução permitida somente no GitHub Actions de ofelipepeixoto/security-workbench."}));
  process.exitCode = 1;
} else {
  const diagnostics=createSmokeDiagnostics(fetch);
  let check='acquisition';
  try {
    // The scanner deliberately omits Authorization and cookies. No token is read.
    const result = await inspectGitHub(REPOSITORY, REPOSITORY_ID, REVISION, {fetcher:diagnostics.fetcher});
    check='verified_revision';
    assert.equal(result.verified_revision, true);
    check='revision';
    assert.equal(result.revision, REVISION);
    check='repository_id';
    assert.equal(result.repository_id, REPOSITORY_ID);
    check='files_read';
    assert.ok(Number.isSafeInteger(result.files_read) && result.files_read > 0);
    check='bytes_read';
    assert.ok(Number.isSafeInteger(result.bytes_read) && result.bytes_read > 0);
    check='snapshot_digest';
    assert.match(result.snapshot_digest, /^[0-9a-f]{64}$/);
    check='files_limit';
    assert.ok(result.files_acquired <= SCANNER_LIMITS.files);
    check='bytes_limit';
    assert.ok(result.bytes_acquired <= SCANNER_LIMITS.bytes);
    check='partial_coverage';
    if (result.files_acquired >= SCANNER_LIMITS.files || result.bytes_acquired >= SCANNER_LIMITS.bytes) assert.equal(result.partial, true);
    check='candidate_status';
    assert.ok(result.findings.every((finding) => finding.status === "candidate"));
    console.log(JSON.stringify({status: "passed", source: "github-public", repository: REPOSITORY, repository_id: result.repository_id, revision: result.revision, verified_revision: result.verified_revision, snapshot_digest: result.snapshot_digest, files_read: result.files_read, bytes_read: result.bytes_read, files_acquired: result.files_acquired, bytes_acquired: result.bytes_acquired, partial: result.partial, omissions_count: result.omissions.length, candidates_count: result.findings.length, dependencies_count: result.dependencies.length}));
  } catch (error) {
    // Same failing assertions, exit status, transport and budget. Only fixed
    // stages, HTTP status and numeric quota metadata are added for diagnosis.
    console.error(JSON.stringify({status: "failed", repository: REPOSITORY, revision: REVISION, reason: "A aquisição pública ou uma verificação do smoke não concluiu; nenhum conteúdo do alvo foi emitido.",diagnostic:diagnostics.snapshot(error,check)}));
    process.exitCode = 1;
  }
}
