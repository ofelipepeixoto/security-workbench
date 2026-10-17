import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {normalizeRepo, repositoryMetadata, inspectGitHub, renderReport, SCANNER_LIMITS} from "../lib/scanner.mjs";

const REPO = "ofelipepeixoto/rea";
const REVISION = "a".repeat(40), TREE = "b".repeat(40), ID = 1234;
const sha1 = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
function apiFixture(files = {"main.py": "print('hello')\n"}, change = () => {}) {
  const map = new Map(), calls = [];
  const listing = [];
  map.set(`/repos/${REPO}`, {id: ID, full_name: REPO, private: false, default_branch: "feat/read-only"});
  map.set(`/repos/${REPO}/commits/feat%2Fread-only`, {sha: REVISION});
  map.set(`/repos/${REPO}/git/commits/${REVISION}`, {sha: REVISION, tree: {sha: TREE}});
  for (const [path, value] of Object.entries(files)) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const sha = sha1(bytes);
    listing.push({path, mode: "100644", type: "blob", size: bytes.length, sha});
    map.set(`/repos/${REPO}/git/blobs/${sha}`, {sha, size: bytes.length, encoding: "base64", content: bytes.toString("base64")});
  }
  map.set(`/repos/${REPO}/git/trees/${TREE}?recursive=1`, {sha: TREE, tree: listing.reverse(), truncated: false});
  change(map, listing);
  return {map, calls, fetcher: async (url, options) => {
    calls.push({url, options});
    const key = url.slice("https://api.github.com".length);
    assert.ok(map.has(key), `Unexpected endpoint: ${key}`);
    return new Response(JSON.stringify(map.get(key)), {status: 200, headers: {"content-type": "application/json"}});
  }};
}

test("normalizes owner/repo and strict HTTPS GitHub URLs, restricts own scope", () => {
  assert.equal(normalizeRepo("  ofelipepeixoto/REA  "), REPO);
  assert.equal(normalizeRepo("https://github.com/ofelipepeixoto/REA/"), REPO);
  for (const input of ["https://github.com/evil/rea", "https://github.com/ofelipepeixoto/rea?x=y", "https://github.com/ofelipepeixoto/rea#main", "https://github.com/ofelipepeixoto/%72ea", "https://github.com@evil.example/ofelipepeixoto/rea", "https://token@github.com/ofelipepeixoto/rea", "http://github.com/ofelipepeixoto/rea", "ofelipepeixoto/../rea", "ofelipepeixoto//rea", "other/repo", "https://github.com/ofelipepeixoto/foo/../rea", "https://github.com/ofelipepeixoto/re\na"]) assert.throws(() => normalizeRepo(input));
});

test("metadata rejects private repositories and invalid IDs/branches/identity", async () => {
  const valid = apiFixture();
  assert.deepEqual(await repositoryMetadata(REPO, valid), {repo: REPO, repository_id: ID, default_branch: "feat/read-only", private: false});
  for (const patch of [{private: true}, {id: true}, {id: 0}, {id: 1.5}, {full_name: "ofelipepeixoto/other"}, {default_branch: "../main"}]) {
    const fixture = apiFixture({}, (map) => Object.assign(map.get(`/repos/${REPO}`), patch));
    await assert.rejects(repositoryMetadata(REPO, fixture));
  }
});

test("manual redirect mode rejects a Location response without fetching its destination", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({url, redirect: options.redirect});
    return new Response(null, {status: 302, headers: {Location: "https://evil.example/outside-scope"}});
  };
  await assert.rejects(repositoryMetadata(REPO, {fetcher}), /HTTP 302/);
  assert.deepEqual(calls, [{url: `https://api.github.com/repos/${REPO}`, redirect: "manual"}]);
});

test("reports exhausted public GitHub quota without following or retrying", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return new Response(null, {status: 403, headers: {"x-ratelimit-limit": "60", "x-ratelimit-remaining": "0"}});
  };
  await assert.rejects(repositoryMetadata(REPO, {fetcher}), {name: "GitHubRateLimitError"});
  assert.equal(calls, 1);
});

test("pins branch SHA, verifies blobs, and omits credentials/cookies/redirects", async () => {
  const fixture = apiFixture();
  const result = await inspectGitHub(REPO, ID, null, fixture);
  assert.equal(result.revision, REVISION);
  assert.equal(result.files_read, 1);
  assert.equal(result.verified_revision, true);
  assert.equal(result.partial, false);
  assert.match(fixture.calls[1].url, /commits\/feat%2Fread-only$/);
  assert.match(fixture.calls[2].url, new RegExp(`/git/commits/${REVISION}$`));
  assert.equal(fixture.calls.filter((call) => call.url.includes("/commits/feat")).length, 1);
  for (const {url, options} of fixture.calls) {
    assert.ok(url.startsWith("https://api.github.com/repos/ofelipepeixoto/rea"));
    assert.equal(options.method, "GET"); assert.equal(options.redirect, "manual"); assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "no-store"); assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers.Cookie, undefined);
  }
});

test("rejects repository ID mismatch before any commit/blob acquisition", async () => {
  const fixture = apiFixture();
  await assert.rejects(inspectGitHub(REPO, ID + 1, null, fixture), /Identidade/);
  assert.equal(fixture.calls.length, 1);
});

test("rejects commit/tree/blob mismatches rather than saving unverified evidence", async () => {
  for (const kind of ["commit", "tree", "blob", "data"]) {
    const fixture = apiFixture({}, (map) => {
      if (kind === "commit") map.get(`/repos/${REPO}/git/commits/${REVISION}`).sha = "c".repeat(40);
      if (kind === "tree") map.get(`/repos/${REPO}/git/trees/${TREE}?recursive=1`).sha = "c".repeat(40);
    });
    if (["blob", "data"].includes(kind)) {
      const another = apiFixture({"main.py": "hello"}, (map, list) => {
        const blob = map.get(`/repos/${REPO}/git/blobs/${list[0].sha}`);
        if (kind === "blob") blob.sha = "c".repeat(40); else blob.content = Buffer.from("world").toString("base64");
      });
      await assert.rejects(inspectGitHub(REPO, ID, REVISION, another), /divergente/);
    } else await assert.rejects(inspectGitHub(REPO, ID, REVISION, fixture), /divergente/);
  }
});

test("binary files consume acquisition/request budgets and force partial coverage", async () => {
  const files = Object.fromEntries(Array.from({length: 21}, (_, i) => [`${String(i).padStart(2, "0")}.js`, Buffer.from([0, i])]));
  const fixture = apiFixture(files);
  const result = await inspectGitHub(REPO, ID, REVISION, fixture);
  assert.equal(result.files_acquired, 20); assert.equal(result.bytes_acquired, 40);
  assert.equal(result.files_read, 0); assert.equal(result.bytes_read, 0); assert.equal(result.binary_skipped, 20);
  assert.equal(fixture.calls.filter((call) => call.url.includes("/git/blobs/")).length, 20);
  assert.equal(result.partial, true); assert.ok(result.omissions.some((x) => x.includes("Limite web")));
});

test("byte limit, oversized files, symlinks, traversal and env paths are bounded", async () => {
  const files = Object.fromEntries(Array.from({length: 9}, (_, i) => [`${i}.txt`, Buffer.alloc(256 * 1024, 97 + i)]));
  files["huge.py"] = Buffer.alloc(256 * 1024 + 1, 97);
  files[".env.py"] = "password='synthetic_12345'";
  files["../outside.py"] = "password='synthetic_12345'";
  files["node_modules/a.js"] = "password='synthetic_12345'";
  const fixture = apiFixture(files);
  const result = await inspectGitHub(REPO, ID, REVISION, fixture);
  assert.equal(result.files_acquired, 8); assert.equal(result.bytes_acquired, 2 * 1024 * 1024); assert.equal(result.partial, true);
  assert.equal(result.findings.length, 0);
  const symlink = apiFixture({"link.py": "bad"}, (_map, list) => {list[0].mode = "120000";});
  const skipped = await inspectGitHub(REPO, ID, REVISION, symlink);
  assert.equal(skipped.files_acquired, 0); assert.equal(skipped.partial, true);
  const oversized = await inspectGitHub(REPO, ID, REVISION, apiFixture({"large.py": Buffer.alloc(256 * 1024 + 1)}));
  assert.equal(oversized.files_acquired, 0); assert.equal(oversized.oversized_skipped, 1);
});

// Expected findings, texts, fingerprints, manifest groups and digest generated by
// Python PR #6 workbench.core._inspect_text + hashlib over these exact UTF-8 bytes.
const PYTHON_FIXTURE = {
  ".github/workflows/ci.yml": "permissions: write-all\n",
  "package.json": "{\"dependencies\": {\"alpha\": \"^1.2.3\", \"private-source\": \"https://demo:fixture@invalid.example/pkg?token=fake\"}, \"devDependencies\": {\"tool\": \"2.0.0\"}}",
  "src/main.py": "password = \"synthetic_12345\"\n",
  "requirements.txt": "requests==2.32.0\nnot-pinned>=1\n"
};
test("matches Python fixture fingerprints, redacted evidence, groups and snapshot digest", async () => {
  const result = await inspectGitHub(REPO, ID, REVISION, apiFixture(PYTHON_FIXTURE));
  assert.equal(result.snapshot_digest, "04500d923b6c69dbbe95e40115cbf76024757c45c7e2bc09a1eecec56b2fc366");
  assert.equal(result.bytes_read, 231);
  assert.deepEqual(result.findings, [
    {fingerprint: "5043a039b349ac5a3e2f", kind: "broad-workflow-permissions", path: ".github/workflows/ci.yml", line: 1, status: "candidate", confidence: "high", evidence: "Declaração permissions: write-all em .github/workflows/ci.yml:1.", impact: "Um workflow comprometido pode obter permissões amplas, conforme seu gatilho e contexto.", recommendation: "Revisar o gatilho e conceder apenas permissões específicas necessárias."},
    {fingerprint: "19de7dc085801c2d6085", kind: "possible-secret", path: "src/main.py", line: 1, status: "candidate", confidence: "medium", evidence: "Atribuição a password com valor [REDACTED] em src/main.py:1.", impact: "Uma credencial real exposta pode permitir acesso indevido; a validade não foi verificada.", recommendation: "Revisar o valor fora do relatório; se for real, revogá-lo e removê-lo do histórico com procedimento controlado."}
  ]);
  assert.deepEqual(result.dependencies, [
    {name: "alpha", version: "^1.2.3", source: "package.json:dependencies"},
    {name: "private-source", version: "[REDACTED]", source: "package.json:dependencies"},
    {name: "tool", version: "2.0.0", source: "package.json:devDependencies"},
    {name: "requests", version: "2.32.0", source: "requirements.txt"}
  ]);
  assert.ok(!JSON.stringify(result).includes("synthetic_12345"));
  assert.ok(!JSON.stringify(result).includes("demo:fixture"));
  assert.ok(!JSON.stringify(result).includes("token=fake"));
});

test("only root manifests inventory dependencies; fixture candidates keep low confidence", async () => {
  const result = await inspectGitHub(REPO, ID, REVISION, apiFixture({"sub/package.json": '{"dependencies":{"foo":"1.0.0"}}', "test/fixture.py": 'password="synthetic_12345"\nsecret="test_placeholder"\n'}));
  assert.deepEqual(result.dependencies, []); assert.equal(result.findings.length, 1); assert.equal(result.findings[0].confidence, "low");
});

test("streaming JSON size ceiling cancels untrusted response without reading all bytes", async () => {
  let cancelled = false, pulls = 0;
  const fetcher = async () => new Response(new ReadableStream({pull(controller) {pulls++; controller.enqueue(new Uint8Array(1024 * 1024));}, cancel() {cancelled = true;}}));
  await assert.rejects(repositoryMetadata(REPO, {fetcher}), /4 MiB/);
  assert.ok(cancelled); assert.ok(pulls <= 7);
  const hugeHeader = async () => new Response("{}", {headers: {"content-length": String(SCANNER_LIMITS.responseBytes + 1)}});
  await assert.rejects(repositoryMetadata(REPO, {fetcher: hugeHeader}), /4 MiB/);
});

test("truncated coverage and aggregate finding/dependency limits stay explicit", async () => {
  const fixture = apiFixture({"main.py": Array.from({length: 110}, () => 'secret="synthetic_12345"').join("\n"), "package.json": JSON.stringify({dependencies: Object.fromEntries(Array.from({length: 510}, (_, i) => [`dep${i}`, "1.0.0"]))})}, (map) => {map.get(`/repos/${REPO}/git/trees/${TREE}?recursive=1`).truncated = true;});
  const result = await inspectGitHub(REPO, ID, REVISION, fixture);
  assert.equal(result.partial, true); assert.equal(result.findings.length, 100); assert.equal(result.findings_total, 110);
  assert.equal(result.dependencies.length, 500); assert.equal(result.dependencies_total, 510);
  assert.ok(result.omissions.some((x) => x.includes("truncada"))); assert.ok(result.omissions.some((x) => x.includes("100 candidatos"))); assert.ok(result.omissions.some((x) => x.includes("500 dependências")));
});

test("Markdown report treats source fields as text, escaping HTML/links/code/lines", () => {
  const hostile = '<script>alert(1)</script>\n[x](https://evil.example) `code`';
  const report = renderReport({repo: hostile, id: "id", revision: REVISION, repository_id: ID, verified_revision: true, files_read: 1, bytes_read: 2, findings: [{kind: hostile, fingerprint: "f", path: hostile, line: 1, status: "candidate", confidence: "medium", evidence: hostile, impact: hostile, recommendation: hostile}], dependencies: [{name: hostile, version: "[REDACTED]", source: hostile}], omissions: [hostile]});
  assert.ok(!report.includes("<script>")); assert.ok(!report.includes("[x](")); assert.ok(!report.includes("https://evil")); assert.ok(!report.includes("`code`"));
  assert.ok(report.includes("&#60;script&#62;")); assert.match(report, /sem análise de CVEs/); assert.match(report, /Ausência de achados não comprova segurança/);
});
