#!/usr/bin/env bash
# Trusted operator toolchain only. No targets, installs, network or REA execution.
set -euo pipefail
umask 077
fail() { printf 'PREPARACAO_BLOQUEADA codigo=%s typecheck_complete=false ready_for_rea=false\n' "$1" >&2; exit 1; }
trap 'printf "PREPARACAO_INTERROMPIDA terminacao_unidade=nao_confirmada typecheck_complete=false ready_for_rea=false\n" >&2; exit 130' INT TERM HUP
[[ $# == 0 ]] || fail argumentos_nao_suportados
[[ ${HOME:-} == /* && $HOME != / && -d $HOME ]] || fail home_invalido
export PATH=/usr/bin:/bin
for required in uname git sha256sum realpath mktemp mkdir mv chmod stat date tail systemd-run timeout env id cat awk; do
  command -v "$required" >/dev/null 2>&1 || fail ferramenta_ausente
done
[[ $(uname -s) == Linux ]] || fail plataforma_nao_suportada
readonly source_sha=3e7c6302233ecbcb9b92e43ee5a60337738961bd
readonly lock_sha=4d298e57d8424a14208f470446be51a0f61cdd932650059557acd5bc21009eb6
readonly bwrap_sha=d7e217424a96140625d3e83df81e66a9e91de40ed9f882d07505da99fa005a76
readonly base="$HOME/.local/share/security-workbench"
readonly tool="$base/rea-3e7c630"
readonly node="$base/node-v24.19.0-linux-x64/bin/node"
readonly bwrap="$base/bubblewrap-0.13.1/bin/bwrap"
[[ -x $node && -f $node && ! -L $node ]] || fail node_ausente
[[ -x $bwrap && -f $bwrap && ! -L $bwrap ]] || fail bwrap_ausente
for directory in "$base" "$tool" "$tool/src" "$tool/scripts" "$tool/node_modules" "$tool/.agents/skills"; do
  [[ -d $directory && $(realpath -e -- "$directory") == "$directory" ]] || fail diretorio_invalido
done
[[ $(realpath -e -- "$node") == "$node" && $(realpath -e -- "$bwrap") == "$bwrap" ]] || fail executavel_redirecionado
[[ $(stat -c %u -- "$base") == "$(id -u)" ]] || fail proprietario_invalido
[[ $(env -i "$node" --version) == v24.19.0 ]] || fail versao_node_incorreta
[[ $(sha256sum -- "$bwrap") == "$bwrap_sha "* ]] || fail hash_bwrap_incorreto
[[ $(env -i "$bwrap" --version) == 'bubblewrap 0.13.1' ]] || fail versao_bwrap_incorreta
g() { env -i PATH=/usr/bin:/bin HOME="$HOME" GIT_OPTIONAL_LOCKS=0 GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null git -c core.fsmonitor=false -c core.hooksPath=/dev/null -C "$tool" "$@"; }
[[ $(g rev-parse --show-toplevel) == "$tool" && $(g rev-parse HEAD) == "$source_sha" ]] || fail commit_incorreto
# A checkout made with init/fetch can legitimately have no configured remote.
origin=$(g config --get remote.origin.url || true)
[[ -z $origin || $origin == https://github.com/ofelipepeixoto/rea.git || $origin == https://github.com/ofelipepeixoto/rea ]] || fail origem_incorreta
pins_clean() {
  [[ $(g rev-parse HEAD) == "$source_sha" ]] &&
    [[ -z $(g ls-files -v | awk 'substr($0,1,1)!="H" { print "x"; exit }') ]] &&
    g diff --no-ext-diff --no-textconv --quiet --exit-code &&
    g diff --cached --no-ext-diff --no-textconv --quiet --exit-code &&
    [[ $(sha256sum -- "$tool/package-lock.json") == "$lock_sha "* ]]
}
pins_clean || fail arvore_ou_lock_alterado
[[ -z $(g ls-files --others -- src scripts .agents) ]] || fail fonte_extra_nao_fixada
[[ -z $(g ls-files --stage -- src scripts .agents | while read -r mode rest; do [[ $mode != 120000 ]] || printf x; done) ]] || fail fonte_symlink
for file in package.json package-lock.json tsconfig.json tsconfig.build.json; do
  [[ -f $tool/$file && ! -L $tool/$file ]] || fail arquivo_fonte_invalido
done
if [[ -e $tool/dist || -L $tool/dist ]]; then
  [[ -d $tool/dist && ! -L $tool/dist && $(stat -c %u -- "$tool/dist") == "$(id -u)" ]] || fail dist_invalido
fi
# Read package metadata only; do not import dependencies or invoke the compiler.
env -i "$node" -e '
const fs=require("node:fs"), path=require("node:path"), root=process.argv[1];
for (const [name,version] of [["typescript","7.0.2"],["@typescript/typescript-linux-x64","7.0.2"],["rolldown","1.2.12"],["@rolldown/binding-linux-x64-gnu","1.2.12"]]) {
  const item=JSON.parse(fs.readFileSync(path.join(root,"node_modules",name,"package.json"),"utf8"));
  if(item.version!==version) process.exit(1);
}
' "$tool" >/dev/null 2>&1 || fail dependencias_incompativeis

# All prerequisite and ownership checks precede the first filesystem mutation.
record=$(mktemp -d "$base/rea-runtime-prepare.XXXXXXXX")
chmod 700 "$record"
printf 'registro_local=%s\n' "${record##*/}"
if [[ -d $tool/dist ]]; then
  mv -T --no-clobber -- "$tool/dist" "$record/dist.previous"
  [[ ! -e $tool/dist && -d $record/dist.previous ]] || fail preservacao_dist_falhou
fi
mkdir -m 700 -- "$tool/dist"
printf 'phase\texit_code\telapsed_seconds\n' > "$record/phases.tsv"
cat > "$record/phase.sh" <<'PHASE'
#!/usr/bin/env bash
set -euo pipefail
phase=$1; bwrap=$2; node=$3; tool=$4
case "$phase" in emit|bundle) ;; *) exit 64 ;; esac
cgroup=$(awk -F: '$1=="0" {print $3}' /proc/self/cgroup)
[[ $cgroup == /* && $cgroup != *..* ]] || exit 65
cg="/sys/fs/cgroup$cgroup"
read -r memory < "$cg/memory.max"
read -r swap < "$cg/memory.swap.max"
read -r tasks < "$cg/pids.max"
read -r quota period < "$cg/cpu.max"
[[ $memory == 2147483648 && $swap == 0 && $tasks == 128 && $quota =~ ^[0-9]+$ && $quota == "$period" ]] || exit 66
printf 'LIMITES_FASE_OK fase=%s\n' "$phase"
exec "$bwrap" --unshare-user --unshare-net --unshare-pid --unshare-ipc --unshare-uts \
  --die-with-parent --new-session --cap-drop ALL --clearenv \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib --symlink usr/lib64 /lib64 \
  --dir /runtime --ro-bind "$node" /runtime/node --dir /tool --dir /tool/.agents \
  --ro-bind "$tool/src" /tool/src --ro-bind "$tool/scripts" /tool/scripts \
  --ro-bind "$tool/node_modules" /tool/node_modules --ro-bind "$tool/.agents/skills" /tool/.agents/skills \
  --ro-bind "$tool/package.json" /tool/package.json --ro-bind "$tool/package-lock.json" /tool/package-lock.json \
  --ro-bind "$tool/tsconfig.json" /tool/tsconfig.json --ro-bind "$tool/tsconfig.build.json" /tool/tsconfig.build.json \
  --bind "$tool/dist" /tool/dist --proc /proc --dev /dev --tmpfs /tmp --dir /tmp/home \
  --setenv HOME /tmp/home --setenv TMPDIR /tmp --setenv PATH /runtime:/usr/bin:/bin --setenv LANG C \
  --setenv GOMAXPROCS 2 --setenv GOMEMLIMIT 1GiB --setenv RAYON_NUM_THREADS 2 --chdir /tool \
  -- /bin/bash -euc '
case "$1" in
  emit)
    /runtime/node scripts/check-dependency-install.mjs
    /runtime/node scripts/generate-package-metadata.mjs --check
    /runtime/node node_modules/typescript/bin/tsc -p tsconfig.build.json --noCheck --pretty false
    ;;
  bundle) /runtime/node --max-old-space-size=768 scripts/bundle-runtime.mjs ;;
  *) exit 64 ;;
esac
' rea-runtime-phase "$phase"
PHASE
chmod 700 "$record/phase.sh"
run_phase() {
  local phase=$1 started ended status
  started=$(date +%s)
  printf 'FASE_INICIO fase=%s\n' "$phase"
  if (
    ulimit -f 16384
    env -i PATH=/usr/bin:/bin HOME="$HOME" XDG_RUNTIME_DIR="/run/user/$(id -u)" \
    timeout --signal=TERM --kill-after=2s 190s \
    systemd-run --user --quiet --wait --collect --expand-environment=no --unit="rea-runtime-$phase-${record##*.}" \
      -p MemoryMax=2G -p MemorySwapMax=0 -p TasksMax=128 -p CPUQuota=100% \
      -p RuntimeMaxSec=180s -p TimeoutStopSec=2s -p KillMode=control-group -p NoNewPrivileges=yes \
      -p LimitFSIZE=16M -p UMask=0077 -p "StandardOutput=truncate:$record/$phase.stdout" \
      -p "StandardError=truncate:$record/$phase.stderr" \
      /usr/bin/env -i PATH=/usr/bin:/bin LANG=C /bin/bash "$record/phase.sh" "$phase" "$bwrap" "$node" "$tool"
  ) > "$record/$phase.unit" 2>&1; then status=0; else status=$?; fi
  ended=$(date +%s)
  printf '%s\t%s\t%s\n' "$phase" "$status" "$((ended-started))" >> "$record/phases.tsv"
  printf 'FASE fase=%s status=%s segundos=%s\n' "$phase" "$status" "$((ended-started))"
  if [[ $status != 0 ]]; then
    printf 'terminacao_unidade=nao_confirmada ready_for_rea=false\n' >&2
    # Only own regular files, at most 4096 bytes total. Never dump a journal.
    for file in "$record/$phase.stderr" "$record/$phase.stdout" "$record/$phase.unit"; do
      [[ -f $file && ! -L $file ]] && tail -c 1365 -- "$file" >&2
    done
  fi
  return "$status"
}
outputs_exist() {
  local file
  for file in "$@"; do [[ -s $tool/$file && -f $tool/$file && ! -L $tool/$file ]] || return 1; done
}
run_phase emit || fail emissao_falhou
outputs_exist dist/generatedPackageMetadata.js dist/cli.js dist/cliOutput.js dist/cli/cliResultOutput.js \
  dist/composition/javascriptAnalysisWorkerProcess.js dist/main.js || fail emissao_incompleta
pins_clean || fail pins_alterados_apos_emissao
run_phase bundle || fail bundle_falhou
outputs_exist dist/generatedPackageMetadata.js dist/cli-runtime/cli.js dist/cli-runtime/cliOutput.js \
  dist/cli-runtime/cliResultOutput.js dist/composition/javascriptAnalysisWorkerProcess.js || fail bundle_incompleto
pins_clean || fail pins_alterados_apos_bundle
(cd "$tool" && sha256sum -- dist/generatedPackageMetadata.js dist/cli-runtime/cli.js \
  dist/cli-runtime/cliOutput.js dist/cli-runtime/cliResultOutput.js \
  dist/composition/javascriptAnalysisWorkerProcess.js) > "$record/runtime-sha256.txt"
printf '{"source_commit":"%s","typecheck_complete":false,"ready_for_rea":false}\n' "$source_sha" > "$record/result.json"
cat "$record/runtime-sha256.txt"
printf 'RUNTIME_PREPARADO_SEM_TYPECHECK\ntypecheck_complete=false\nready_for_rea=false\n'
