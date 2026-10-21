#!/usr/bin/env bash
# Own fixture: GitHub repo 1419403320, commit 1b0c93114d7a215aa73844e5a7edd62620dd25eb.
# No arguments, network, target execution, installs or hosted writes.
set -euo pipefail
umask 077
fail() { printf 'FIXTURE_BLOQUEADA codigo=%s terminacao_unidade=nao_confirmada native_fixture_completed=false typecheck_complete=false ready_for_untrusted_targets=false\n' "$1" >&2; exit 1; }
trap 'printf "terminacao_unidade=nao_confirmada native_fixture_completed=false ready_for_untrusted_targets=false\n" >&2; exit 130' INT TERM HUP
[[ $# == 0 ]] || fail argumentos_nao_suportados
[[ ${HOME:-} == /* && $HOME != / && -d $HOME ]] || fail home_invalido
export PATH=/usr/bin:/bin
for command in uname git sha256sum realpath mktemp mkdir chmod stat date tail timeout env id cat awk readlink systemd-run systemctl; do
  command -v "$command" >/dev/null 2>&1 || fail ferramenta_ausente
done
[[ $(uname -s) == Linux ]] || fail plataforma_nao_suportada
readonly source_sha=3e7c6302233ecbcb9b92e43ee5a60337738961bd
readonly lock_sha=4d298e57d8424a14208f470446be51a0f61cdd932650059557acd5bc21009eb6
readonly fixture_sha=d99e67189229b7c47492d92fa3995ad9ae4110490ffeeb16483efeb420c3b29e
readonly base="$HOME/.local/share/security-workbench" tool="$HOME/.local/share/security-workbench/rea-3e7c630"
readonly node="$base/node-v24.19.0-linux-x64/bin/node" bwrap="$base/bubblewrap-0.13.1/bin/bwrap"
[[ -x $node && -f $node && ! -L $node ]] || fail node_ausente
[[ -x $bwrap && -f $bwrap && ! -L $bwrap ]] || fail bwrap_ausente
for path in "$base" "$tool" "$tool/scripts" "$tool/dist" "$tool/node_modules" "$node" "$bwrap"; do
  [[ -e $path && $(realpath -e -- "$path") == "$path" ]] || fail caminho_redirecionado
done
[[ $(stat -c %u -- "$base") == "$(id -u)" ]] || fail proprietario_invalido
[[ $(env -i "$node" --version) == v24.19.0 ]] || fail versao_node_incorreta
check_hash() { [[ -f $1 && ! -L $1 && $(sha256sum -- "$1") == "$2 "* ]]; }
check_hash "$bwrap" d7e217424a96140625d3e83df81e66a9e91de40ed9f882d07505da99fa005a76 || fail bwrap_alterado
[[ $(env -i "$bwrap" --version) == 'bubblewrap 0.13.1' ]] || fail versao_bwrap_incorreta
g() { env -i PATH=/usr/bin:/bin HOME="$HOME" GIT_OPTIONAL_LOCKS=0 GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null git -c core.fsmonitor=false -c core.hooksPath=/dev/null -C "$tool" "$@"; }
pins_clean() {
  [[ $(g rev-parse HEAD) == "$source_sha" && $(g rev-parse --show-toplevel) == "$tool" ]] &&
    [[ -z $(g ls-files -v | awk 'substr($0,1,1)!="H" { print "x"; exit }') ]] &&
    g diff --no-ext-diff --no-textconv --quiet --exit-code && g diff --cached --no-ext-diff --no-textconv --quiet --exit-code &&
    check_hash "$tool/package-lock.json" "$lock_sha"
}
runtime_clean() {
  check_hash "$tool/dist/generatedPackageMetadata.js" 1469cc34329436e5b1b9c6a9d655f8120d59e6bdcb5b843e7bc0ccff9aff7eaa &&
  check_hash "$tool/dist/cli-runtime/cli.js" 4d1a3f41a808135bf7580a431912bbf95703768ad129a33523402d3758ce7500 &&
  check_hash "$tool/dist/cli-runtime/cliOutput.js" aac5314e8632c2f1b450d1e4f460b028ebc55b695d67c14fd0c3f2cdb486abab &&
  check_hash "$tool/dist/cli-runtime/cliResultOutput.js" 52ac8c14f31e9e13697dd9308d782965eee607ded69838a8fd2f297ac0870038 &&
  check_hash "$tool/dist/composition/javascriptAnalysisWorkerProcess.js" dce09f9721a5e82db8a39dd0f48bafc374b743108dc74ceedbc651851209c052
}
pins_clean && runtime_clean || fail fonte_lock_ou_runtime_alterado
[[ -f $tool/package.json && ! -L $tool/package.json && -f $tool/scripts/rea.mjs && ! -L $tool/scripts/rea.mjs ]] || fail launcher_invalido
parent_ns=$(readlink /proc/self/ns/net)
# Only now create a new private record. Existing runtimes and evidence are untouched.
record=$(mktemp -d "$base/rea-inert-fixture.XXXXXXXX")
mkdir -m 700 "$record/input"
printf 'registro_local=%s\n' "${record##*/}"
cat > "$record/input/inert-app.js" <<'FIXTURE_JS'
// Operator-owned fixture for a future static REA analysis.
// Input data only: never import or execute this file during an analysis.
// These structural labels do not represent vulnerabilities or credentials.
export const fixture = {
  id: 'security-workbench-rea-static-v1',
  endpoint: '/fixture/health',
  storageKey: 'fixture.theme',
};
FIXTURE_JS
check_hash "$record/input/inert-app.js" "$fixture_sha" || fail bytes_fixture_incorretos
cat > "$record/check.mjs" <<'CHECK_MJS'
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtureHash = 'd99e67189229b7c47492d92fa3995ad9ae4110490ffeeb16483efeb420c3b29e';
const mode = process.argv[2];
if (mode === 'gate') {
  const checks = { network_namespace: false, only_loopback_or_none: false, fixture_hash: false, fixture_read_only: false, private_paths_absent: true, no_new_privileges: false };
  try {
    checks.network_namespace = await fs.readlink('/proc/self/ns/net') !== process.argv[3];
    checks.no_new_privileges = /^NoNewPrivs:\s+1$/m.test(await fs.readFile('/proc/self/status', 'utf8'));
    const network = (await fs.readFile('/proc/net/dev', 'utf8')).trimEnd().split('\n');
    const names = network.slice(2).filter(line => line.includes(':')).map(line => line.split(':')[0].trim());
    checks.only_loopback_or_none = network.length >= 2 && network[0].includes('Inter-') && names.length <= 1 && names.every(name => name === 'lo');
    const input = await fs.readFile('/input/inert-app.js');
    checks.fixture_hash = input.length === 342 && digest(input) === fixtureHash;
    try { await fs.writeFile('/input/inert-app.js', 'owned gate sentinel'); } catch (error) { checks.fixture_read_only = error.code === 'EROFS'; }
    for (const path of ['/home', '/root', '/mnt', '/run', '/sys']) {
      try { await fs.lstat(path); checks.private_paths_absent = false; } catch (error) { if (error.code !== 'ENOENT') checks.private_paths_absent = false; }
    }
  } catch { /* No native diagnostic or environment content is printed. */ }
  process.stderr.write(JSON.stringify({ fixture_gate: checks }) + '\n');
  if (!Object.values(checks).every(value => value === true)) process.exitCode = 1;
} else if (mode === 'summary') {
  const summary = {
    native_fixture_completed: false, typecheck_complete: false, ready_for_untrusted_targets: false,
    workbench_import_verified: false, loopback_control_repeated: false,
    fixture_repository: 'ofelipepeixoto/security-workbench', fixture_repository_id: 1419403320,
    fixture_commit: '1b0c93114d7a215aa73844e5a7edd62620dd25eb',
    engine_source_commit: '3e7c6302233ecbcb9b92e43ee5a60337738961bd',
    package_version: '6.4.0', provider_contract_version: '1',
    limits_requested: {
      family_memory_bytes: 1073741824, swap_bytes: 0, tasks: 64, cpu_percent: 100, global_timeout_s: 30,
      parent_old_space_mib: 320, parent_semi_space_mib: 8, worker_old_space_mib: 128, worker_timeout_ms: 5000,
      semantic_nodes: 128, semantic_nodes_per_file: 128, output_file_max_bytes: 1048576,
    },
  };
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const coverage = value => ['complete', 'partial', 'unknown', 'unavailable'].includes(value?.status) ? value.status : 'invalid';
  const complete = value => value?.status === 'complete' && value.truncated === false && value.omitted_count === 0;
  try {
    const stat = await fs.lstat(process.argv[3]);
    if (!stat.isFile() || stat.size < 1 || stat.size > 1048576) throw new Error('bounded');
    const bytes = await fs.readFile(process.argv[3]);
    if (bytes.length !== stat.size) throw new Error('changed');
    const evidence = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const result = evidence.normalized_result, stats = result?.statistics, graph = result?.graph, semantic = result?.semantic_graph;
    const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    const native = !Object.hasOwn(evidence, 'error') &&
      evidence.operation === 'analyze_javascript_application' &&
      evidence.predicate_type === 'rea.javascript-application-analysis' &&
      evidence.provider?.id === 'rea-javascript-application' && evidence.provider.version === '1' &&
      evidence.authority === 'shipped-artifact' && evidence.confidence === 'derived' &&
      /^ev_[a-f0-9]{64}$/.test(evidence.evidence_id);
    const subject = evidence.subject?.format === 'directory' && hex(result?.root_artifact_sha256) &&
      evidence.subject.digest?.sha256 === result.root_artifact_sha256;
    const selection = result?.source_selection?.requested_paths;
    const selected = Array.isArray(selection) && selection.length === 1 && selection[0] === 'inert-app.js' &&
      result.source_selection.unselected_files === 0;
    const shape = graph?.schema === 'JavaScriptApplicationGraph' && semantic?.schema === 'JavaScriptSemanticRelationGraph' &&
      /^jag_[a-f0-9]{64}$/.test(graph.graph_id) && /^jsrg_[a-f0-9]{64}$/.test(semantic.graph_id) &&
      semantic.application_graph_id === graph.graph_id && semantic.root_artifact_sha256 === result.root_artifact_sha256 &&
      Array.isArray(graph.root_node_ids) && graph.root_node_ids.length > 0 &&
      Array.isArray(semantic.root_node_ids) && semantic.root_node_ids.length > 0 &&
      Array.isArray(graph.nodes) && graph.nodes.length > 0 && Array.isArray(graph.edges) &&
      Array.isArray(semantic.nodes) && semantic.nodes.length > 0 && Array.isArray(semantic.relations) &&
      Array.isArray(semantic.unknowns) && Array.isArray(result.limitations) && Array.isArray(semantic.coverage?.families);
    const semanticExpected = semantic?.coverage?.status === 'unknown' && semantic.coverage.truncated === false &&
      semantic.coverage.omitted_nodes === 0 && semantic.coverage.omitted_relations === 0 &&
      Array.isArray(semantic.coverage.limits) && semantic.coverage.limits.length === 0;
    Object.assign(summary, {
      evidence_sha256: digest(bytes), evidence_bytes: bytes.length, fixture_sha256: fixtureHash, fixture_bytes: 342,
      root_artifact_sha256_declared: hex(result?.root_artifact_sha256) ? result.root_artifact_sha256 : null,
      graph_coverage: coverage(graph?.coverage), semantic_coverage: coverage(semantic?.coverage),
      relevant_files: count(stats?.relevant_files), parsed_javascript_files: count(stats?.parsed_javascript_files),
      parse_failures: count(stats?.parse_failures), text_bytes_read: count(stats?.text_bytes_read),
      findings_count: count(stats?.findings), graph_nodes: Array.isArray(graph?.nodes) ? graph.nodes.length : null,
      graph_edges: Array.isArray(graph?.edges) ? graph.edges.length : null,
      limitations_count: Array.isArray(result?.limitations) ? result.limitations.length : null,
    });
    const timestamps = [process.argv[4], process.argv[5]];
    if (!timestamps.every(value => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) &&
      Number.isFinite(Date.parse(value)))) throw new Error('time');
    Object.assign(summary, { started_at: timestamps[0], finished_at: timestamps[1] });
    summary.native_fixture_completed = native && subject && selected && shape &&
      result.format === 'directory' && result.input_path === '/input' && stats?.relevant_files === 1 &&
      stats.parsed_javascript_files === 1 && stats.parse_failures === 0 && stats.text_bytes_read === 342 &&
      Array.isArray(result.integrity_contradictions) && result.integrity_contradictions.length === 0 &&
      complete(graph?.coverage) && semanticExpected && summary.findings_count !== null;
  } catch { summary.native_fixture_completed = false; }
  const output = JSON.stringify(summary) + '\n';
  if (Buffer.byteLength(output) > 4096) throw new Error('summary bound');
  process.stdout.write(output);
  if (!summary.native_fixture_completed) process.exitCode = 1;
} else { process.exitCode = 64; }
CHECK_MJS
cat > "$record/run.sh" <<'RUN_SH'
#!/usr/bin/env bash
set -euo pipefail
bwrap=$1; node=$2; tool=$3; record=$4; parent_ns=$5
cgroup=$(awk -F: '$1=="0" {print $3}' /proc/self/cgroup)
[[ $cgroup == /* && $cgroup != *..* ]] || exit 65
cg="/sys/fs/cgroup$cgroup"
[[ $(awk '$1=="NoNewPrivs:" {print $2}' /proc/self/status) == 1 ]] || exit 67
read -r memory < "$cg/memory.max"; read -r swap < "$cg/memory.swap.max"; read -r tasks < "$cg/pids.max"; read -r quota period < "$cg/cpu.max"
[[ $memory == 1073741824 && $swap == 0 && $tasks == 64 && $quota =~ ^[0-9]+$ && $quota == "$period" ]] || exit 66
printf 'LIMITES_ANALISE_OK\n' >&2
exec "$bwrap" --unshare-user --unshare-net --unshare-pid --unshare-ipc --unshare-uts --die-with-parent --new-session --cap-drop ALL --clearenv \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib --symlink usr/lib64 /lib64 \
  --dir /runtime --ro-bind "$node" /runtime/node --dir /tool --ro-bind "$tool/package.json" /tool/package.json \
  --ro-bind "$tool/scripts" /tool/scripts --ro-bind "$tool/dist" /tool/dist --ro-bind "$tool/node_modules" /tool/node_modules \
  --ro-bind "$record/input" /input --ro-bind "$record/check.mjs" /check.mjs --proc /proc --dev /dev --tmpfs /tmp --dir /tmp/home \
  --setenv HOME /tmp/home --setenv TMPDIR /tmp --setenv PATH /runtime:/usr/bin:/bin --setenv LANG C --setenv UV_THREADPOOL_SIZE 1 --chdir /tmp \
  -- /bin/bash -euc '
/runtime/node --max-old-space-size=64 /check.mjs gate "$1"
exec /runtime/node --max-old-space-size=320 --max-semi-space-size=8 /tool/scripts/rea.mjs analyze-javascript-application /input --artifact-format directory --integrity-policy fail --source-path inert-app.js --max-heap-mb 128 --analysis-timeout-ms 5000 --max-semantic-nodes 128 --max-semantic-nodes-per-file 128 --json
' rea-inert-run "$parent_ns"
RUN_SH
unit="rea-inert-fixture-${record##*.}"
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf 'ANALISE_INICIO\n'
if (
  ulimit -f 1024
  env -i PATH=/usr/bin:/bin HOME="$HOME" XDG_RUNTIME_DIR="/run/user/$(id -u)" timeout --signal=TERM --kill-after=2s 40s \
    systemd-run --user --quiet --wait --collect --expand-environment=no --unit="$unit" \
      -p MemoryMax=1G -p MemorySwapMax=0 -p TasksMax=64 -p CPUQuota=100% -p RuntimeMaxSec=30s \
      -p TimeoutStopSec=2s -p KillMode=control-group -p NoNewPrivileges=yes -p LimitFSIZE=1M -p UMask=0077 \
      -p "StandardOutput=truncate:$record/evidence.json" -p "StandardError=truncate:$record/native.stderr" \
      /usr/bin/env -i PATH=/usr/bin:/bin LANG=C /bin/bash "$record/run.sh" "$bwrap" "$node" "$tool" "$record" "$parent_ns"
) > "$record/unit.log" 2>&1; then status=0; else status=$?; fi
finished=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf 'status=%s started_at=%s finished_at=%s\n' "$status" "$started" "$finished" > "$record/status.txt"
if [[ $status != 0 ]]; then printf 'terminacao_unidade=nao_confirmada\n' >&2; fail execucao_incompleta; fi
# --wait status zero confirms command completion. Confirm collection/inactivity too.
if (ulimit -f 1024; env -i PATH=/usr/bin:/bin HOME="$HOME" XDG_RUNTIME_DIR="/run/user/$(id -u)" timeout --kill-after=1s 3s systemctl --user show "$unit" -p LoadState -p ActiveState) > "$record/unit.state" 2> "$record/state.stderr"; then query_status=0; else query_status=$?; fi
load_state=''; active_state=''
while IFS= read -r line; do case "$line" in LoadState=*) load_state=${line#LoadState=} ;; ActiveState=*) active_state=${line#ActiveState=} ;; esac; done < "$record/unit.state"
[[ ( $query_status == 0 || $query_status == 4 ) && $active_state == inactive && ( $load_state == not-found || $load_state == loaded ) ]] || fail estado_unidade_nao_confirmado
printf 'terminacao_unidade=confirmada\n'
pins_clean && runtime_clean && check_hash "$record/input/inert-app.js" "$fixture_sha" || fail identidade_alterada
if (ulimit -f 1024; env -i PATH=/usr/bin:/bin timeout --kill-after=1s 5s "$node" --max-old-space-size=64 "$record/check.mjs" summary "$record/evidence.json" "$started" "$finished") > "$record/summary.json" 2> "$record/summary.stderr"; then
  cat "$record/summary.json"
  printf 'FIXTURE_NATIVA_CONCLUIDA\ntypecheck_complete=false\nready_for_untrusted_targets=false\nworkbench_import_verified=false\n'
else
  [[ ! -f $record/summary.json ]] || tail -c 4096 -- "$record/summary.json"
  fail evidencia_incompleta
fi
