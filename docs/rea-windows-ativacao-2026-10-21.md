# Pré-flight local no Ubuntu/WSL

Este helper testa somente arquivos e conexões de loopback criados por ele. Não instala software, inicia REA, lê repositórios, executa JavaScript do alvo ou altera o Site. A importação JSON e a homologação hospedada são entregas separadas.

## Estado observado

O operador confirmou Ubuntu em WSL 2, kernel 6.18.54.1-microsoft-standard-WSL2, x86_64 e Bubblewrap 0.11.1. Uma chamada benigna com cinco namespaces explícitos e /bin/true retornou zero. Depois, confirmou checksum e versão v24.19.0 do Node Linux oficial. Esses resultados relatados pelo operador não são uma execução deste helper nem comprovação de execução isolada do REA.

No terminal Ubuntu, a partir de uma cópia confiável do Workbench que contenha este arquivo:

~~~bash
"$HOME/.local/share/security-workbench/node-v24.19.0-linux-x64/bin/node" --version
bwrap --version
"$HOME/.local/share/security-workbench/node-v24.19.0-linux-x64/bin/node" scripts/rea-sandbox-preflight.mjs
~~~

O helper usa somente módulos nativos do Node; não requer instalação npm. Windows nativo é recusado antes de criar arquivos. A CLI não aceita opções, caminhos de alvo ou comandos. Não executar com sudo, desativar AppArmor ou contornar falhas de namespace.

## Verificações e limites

- Listener próprio de 127.0.0.1, com controle positivo fora da sandbox e conexão à mesma porta bloqueada dentro.
- Namespace de rede distinto e somente interface lo; nenhum endereço externo é consultado.
- Fixture inerte legível e montada somente leitura: escrita deve retornar EROFS e o hash externo permanecer igual.
- Ausência de /home, /root, /mnt e /run. Não há bind da raiz, diretórios pessoais, discos Windows, sessões ou bancos.
- Somente o arquivo executável do Node é montado em /runtime/node, sem expor arquivos vizinhos. Bibliotecas necessárias precisam estar em /usr; outro layout falha fechado.
- Ambiente mínimo PATH/TMPDIR/PWD, sem credenciais ou proxies encaminhados; stdin fechado e somente pipes de stdout/stderr.
- Subprocesso limitado a 10 segundos, seguido de TERM e KILL após 2 segundos e mais 250 ms para confirmar encerramento; stdout e stderr compartilham teto de 16 KiB. Há ainda controle de loopback de até 1 segundo. Terminação não confirmada permanece bloqueada e não é apresentada como processo encerrado.
- Limpeza somente do diretório temporário criado pelo próprio helper. Falha de limpeza impede aprovação.

O JSON final contém verificações booleanas e código fixo. Não inclui caminhos locais, conteúdo da fixture, IDs de namespace, porta, valores de ambiente ou stderr. Exit zero significa que as verificações deste pré-flight passaram; exit 2 indica bloqueio. Testes com processo simulado verificam transporte e projeção, não comprovam a sandbox real.

## Gate de memória pendente

memory_enforced e ready_for_rea são sempre false, mesmo quando passed é true. O helper não cria nem altera cgroups e não afirma que heap do Node limita a memória da família de processos.

O operador confirmou cgroup v2, controladores memory/pids e systemd do usuário em execução. Em uma unidade transitória própria e benigna, relatou memory.max 536870912, memory.swap.max 0 e pids.max 32. Isso valida os valores daquela unidade, sem demonstrar que este helper ou a futura família de processos REA recebeu os mesmos limites. Antes de executar REA, integrar e verificar esses limites efetivos no executor, além do prazo global e limites de entrada/saída. WSL não desliga a rede automaticamente.

Somente após esses gates, preparar separadamente o REA fixado em 3e7c6302233ecbcb9b92e43ee5a60337738961bd e seu lockfile, com toolchain rastreável. O pacote npm rea-agents@6.4.0 tem gitHead diferente e não substitui esse checkout silenciosamente. Nenhuma preparação ou análise REA é executada por este helper.

Fontes primárias: [Bubblewrap](https://github.com/containers/bubblewrap), [manual Ubuntu](https://manpages.ubuntu.com/manpages/noble/man1/bwrap.1.html), [Node 24.19.0](https://nodejs.org/download/release/v24.19.0/). O comando usa cinco namespaces explícitos sem variantes try: indisponibilidade gera falha, sem fallback.

## Fixture rastreável para a próxima execução estática

`fixtures/rea/inert-app.js` é entrada própria e inerte para a futura análise estática, não um resultado REA. Seu SHA-256 é `d99e67189229b7c47492d92fa3995ad9ae4110490ffeeb16483efeb420c3b29e`. O commit deste PR vincula seus bytes ao repositório do proprietário. Não importar nem executar o arquivo. Rótulos de endpoint e armazenamento são estrutura, não vulnerabilidades. Nenhuma análise do motor foi realizada ao adicionar essa fixture.

O proprietário informou possuir uma VPS Hostinger. Capacidade, serviços existentes, acesso e isolamento não foram inspecionados. Workers/D1 e WSL atendem à preparação atual; a VPS permanece uma opção posterior para executor remoto, sem contratação ou mudança de infraestrutura nesta rodada.

## Preparação do motor relatada pelo operador

Em 21/10/2026, o operador confirmou o checkout dedicado do próprio repositório REA no commit `3e7c6302233ecbcb9b92e43ee5a60337738961bd`, sem alterações rastreadas. O lockfile teve SHA-256 `4d298e57d8424a14208f470446be51a0f61cdd932650059557acd5bc21009eb6` conferido. O npm separado `11.16.0`, indicado por `packageManager`, teve o tarball oficial conferido com SHA-256 `30fc15697c771002878665c29f49dddde9aa8667fa5719854b2f52d3cd19230b`.

A instalação `npm ci --ignore-scripts --include=dev --include=optional`, com configuração/cache dedicados e ambiente mínimo, terminou com 409 pacotes. O lockfile permaneceu íntegro e `scripts/check-dependency-install.mjs` terminou com `DEPENDENCIAS_OK`. A unidade transitória solicitou 2 GiB, swap zero, 128 tarefas, quota de uma CPU e 600 segundos; esses são parâmetros da instalação informada, não medição de consumo nem prova dos futuros limites da análise. A instalação precisou de rede para o registry; não foi uma análise offline. O aviso de manutenção de `prebuild-install@7.1.3` não impediu a instalação e permanece registrado. O inventário desses pacotes é separado da triagem das dependências web.

Compilação e primeira execução do REA permanecem pendentes. `DEPENDENCIAS_OK` não comprova binários opcionais disponíveis nem um runtime compilado.

## Compilação offline proposta — ainda sem resultado

O comando abaixo usa somente o checkout dedicado já preparado, o Node Linux e o npm fixados. Executa os scripts de build da ferramenta confiável; não recebe arquivos de alvo. O `compile` limpa o próprio diretório gerado `dist`, executa TypeScript e Rolldown. Não publicar esse diretório nem `node_modules`. Qualquer erro bloqueia o próximo passo; não retirar namespaces, `NoNewPrivileges`, limites ou habilitar scripts de instalação para contorná-lo.

~~~bash
(
  set -eu
  umask 077
  rea_base="$HOME/.local/share/security-workbench"
  rea_checkout="$rea_base/rea-3e7c630"
  rea_bwrap="$rea_base/bubblewrap-0.13.1/bin/bwrap"

  test "$(git -C "$rea_checkout" rev-parse HEAD)" = \
    3e7c6302233ecbcb9b92e43ee5a60337738961bd
  test -z "$(git -C "$rea_checkout" status --porcelain)"
  test "$("$rea_bwrap" --version)" = 'bubblewrap 0.13.1'
  cd "$rea_base/bubblewrap-0.13.1/bin"
  printf '%s  %s\n' \
    'd7e217424a96140625d3e83df81e66a9e91de40ed9f882d07505da99fa005a76' \
    'bwrap' | sha256sum --check -

  systemd-run --user --quiet --wait --pipe --collect \
    --expand-environment=no \
    --unit=workbench-rea-compile \
    -p MemoryMax=2G -p MemorySwapMax=0 \
    -p TasksMax=128 -p CPUQuota=100% \
    -p RuntimeMaxSec=600s -p TimeoutStopSec=2s \
    -p KillMode=control-group -p UMask=0077 \
    -p NoNewPrivileges=yes \
    /usr/bin/env -i LANG=C PATH=/usr/bin:/bin \
    /bin/sh -eu -c '
      rea_cgroup=$(cut -d: -f3 /proc/self/cgroup)
      test "$(cat "/sys/fs/cgroup${rea_cgroup}/memory.max")" = 2147483648
      test "$(cat "/sys/fs/cgroup${rea_cgroup}/memory.swap.max")" = 0
      test "$(cat "/sys/fs/cgroup${rea_cgroup}/pids.max")" = 128
      printf "LIMITES_COMPILACAO_OK\n"
      exec "$@"
    ' rea-compile-unit \
    "$rea_bwrap" \
    --unshare-user --unshare-net --unshare-pid --unshare-ipc --unshare-uts \
    --die-with-parent --new-session --clearenv --cap-drop ALL \
    --ro-bind /usr /usr \
    --symlink usr/bin /bin --symlink usr/lib /lib \
    --symlink usr/lib64 /lib64 \
    --dir /runtime \
    --ro-bind "$rea_base/node-v24.19.0-linux-x64/bin/node" /runtime/node \
    --ro-bind "$rea_base/npm-11.16.0/package" /npm \
    --bind "$rea_checkout" /tool \
    --proc /proc --dev /dev --tmpfs /tmp \
    --dir /tmp/home --dir /tmp/cache \
    --setenv HOME /tmp/home \
    --setenv XDG_CACHE_HOME /tmp/cache \
    --setenv TMPDIR /tmp --setenv LANG C \
    --setenv PATH /runtime:/usr/bin:/bin \
    --setenv GOMAXPROCS 2 --setenv GOMEMLIMIT 1GiB \
    --setenv RAYON_NUM_THREADS 2 \
    --chdir /tool \
    /bin/sh -eu -c '
      touch /tmp/global.npmrc
      /runtime/node scripts/generate-package-metadata.mjs --check
      exec /runtime/node /npm/bin/npm-cli.js \
        --userconfig=/dev/null \
        --globalconfig=/tmp/global.npmrc \
        --offline --ignore-scripts --no-audit --no-fund \
        --update-notifier=false run compile
    ' </dev/null

  cd "$rea_checkout"
  for rea_file in \
    dist/generatedPackageMetadata.js \
    dist/cli-runtime/cli.js \
    dist/cli-runtime/cliOutput.js \
    dist/cli-runtime/cliResultOutput.js \
    dist/composition/javascriptAnalysisWorkerProcess.js
  do
    test -f "$rea_file"
    sha256sum "$rea_file"
  done

  git diff --exit-code --quiet
  printf '%s  %s\n' \
    '4d298e57d8424a14208f470446be51a0f61cdd932650059557acd5bc21009eb6' \
    'package-lock.json' | sha256sum --check -
  printf 'RUNTIME_COMPILADO_OK\n'
)
~~~

Esse comando foi revisado no código fixado e atualizado para o Bubblewrap privado conferido; ainda não foi executado no ambiente do operador. Confere 2 GiB/swap zero/128 tarefas na própria unidade antes do build. Os controles da compilação não substituem a verificação no executor da futura análise.

## Atualização do gate Bubblewrap

A versão curta `bwrap --version` não informa o pacote completo nem eventuais patches da distribuição. O [aviso oficial GHSA-pxhw-h44j-8pfx / CVE-2026-87766](https://github.com/containers/bubblewrap/security/advisories/GHSA-pxhw-h44j-8pfx) afeta versões upstream anteriores a 0.12.0: durante o setup, criar destinos sob conteúdo de filesystem controlado por atacante pode seguir symlinks para fora. Não foi observada exploração e essa condição não foi identificada no layout fixo acima, que não cria descendentes dentro de `/tool`. Isso não autoriza usos arbitrários do Bubblewrap.

O [USN-8779-2](https://ubuntu.com/security/notices/USN-8779-2), de 18/09/2026, informa a reversão do patch anterior por regressão. Portanto o USN-8779-1 sozinho não prova uma correção atual. Antes de aceitar entradas não confiáveis, obter a identificação completa e consultar a correção aplicável; não atualizar a distribuição, instalar PPA ou substituir o binário implicitamente:

~~~bash
dpkg-query -W -f='${Package} ${Version}\n' bubblewrap
apt-cache policy bubblewrap
~~~

Inicialmente, o operador retornou pacote instalado e candidato `0.11.1-1ubuntu0.1`, nos índices locais de `resolute-updates/main` e `resolute-security/main` amd64. Depois, `sudo apt-get update --error-on=any` concluiu com sucesso, e o candidato passou a `0.11.1-1ubuntu0.3`; instalado permaneceu `0.11.1-1ubuntu0.1`. A simulação mostrou um upgrade, zero novos pacotes, zero remoções e 130 não atualizados; nenhuma instalação/atualização de pacote foi executada. O candidato 0.3 corresponde à reversão do USN-8779-2 e não fecha este gate. As 12 verificações aprovadas do helper continuam válidas para a fixture própria usada, sem constituir auditoria do Bubblewrap ou prontidão para entradas adversariais.

## Caminho separado para Bubblewrap corrigido

Foi conferida na [release oficial 0.13.1](https://github.com/containers/bubblewrap/releases/tag/v0.13.1), publicada em 14/10/2026 às 12:21 UTC, a fonte `bubblewrap-0.13.1.tar.xz` com SHA-256 `0e85c8702248b8dd64144f594147553650cdd0e4c951690345faace79c217c4d`. O tag aponta para `362936aea0d5c6e70f7af75d2d44b5a914cb4ba2`. Não é uma instalação já realizada ou uma auditoria completa da ferramenta.

A preparação proposta usa fonte fixada e prefix privado `$HOME/.local/share/security-workbench/bubblewrap-0.13.1`, sem substituir `/usr/bin/bwrap`, alterar o PATH global, adicionar PPA ou atualizar a distribuição. O build da fonte confiável usa Meson/Ninja e libcap; não envolve arquivos de alvo. As opções reais conferidas são `--wrap-mode=nodownload`, `-Dman=disabled`, `-Dbash_completion=disabled`, `-Dzsh_completion=disabled` e `-Dtests=false`. A versão não suporta mais setuid; não usar opções antigas que tentem habilitá-lo. A desativação dos testes upstream limita a prova do build: o pré-flight próprio deve ser repetido no executável efetivamente instalado e não equivale à suíte upstream.

Primeiro instalar somente as ferramentas de compilação e dependências normais, a partir dos repositórios Ubuntu já configurados. APT apresenta a transação antes da confirmação; pode instalar/atualizar os pacotes solicitados e suas dependências, sem executar upgrade global:

~~~bash
(
  set -eu
  sudo apt-get install --no-install-recommends \
    build-essential libcap-dev meson ninja-build pkg-config
  cc --version
  python3 --version
  meson --version
  ninja --version
  pkg-config --modversion libcap
  printf 'FERRAMENTAS_BWRAP_OK\n'
)
~~~

O operador forneceu saída com `FERRAMENTAS_BWRAP_OK`: GCC 15.2.0, Python 3.14.4, Meson 1.10.1, Ninja 1.13.2 e libcap 2.75. APT instalou 44 pacotes e atualizou cinco, sem remoções; 126 permaneceram não atualizados. Foram obtidos 86,6 MB e APT previu 277 MB adicionais de disco, sem medição posterior do espaço usado. As atualizações necessárias incluíram libc6, libc-bin, libc-gconv-modules-extra, locales e libbz2-1.0; não foi um upgrade global. O Python observado atende à preparação Meson, sem homologar o núcleo Workbench que declara Python 3.12.

A engenharia baixou separadamente o tarball oficial para inspeção em memória: 129472 bytes, SHA-256 publicado conferido, diretório raiz `bubblewrap-0.13.1` e arquivo Meson presente. Não houve extração, compilação ou execução do fonte nessa inspeção. O operador posteriormente concluiu o build e a instalação privados, conforme resultado abaixo; o pré-flight do executável continua pendente. Se AppArmor ou namespaces recusarem o executável privado, registrar o bloqueio sem desabilitar a proteção ou recorrer silenciosamente ao binário antigo.

`runPreflight` aceita, somente para chamada por módulo local confiável, `bwrapExecutable` com caminho absoluto POSIX sem NUL. O padrão continua `/usr/bin/bwrap`; disponibilidade e processo usam o mesmo caminho selecionado, sem seleção por PATH/ambiente nem fallback. A CLI continua sem argumentos e não recebe código ou caminhos de alvo. O invólucro local deverá apontar explicitamente para o executável conferido e imprimir somente o JSON projetado; `memory_enforced` e `ready_for_rea` continuam false.

## Build privado do Bubblewrap — resultado fornecido pelo operador

O bloco preserva diretórios existentes: se os dois caminhos dedicados já existirem, para sem apagá-los. O download usa somente HTTPS, configuração curl desativada e hash fixado antes de extrair. Não requer sudo. O bootstrap usa o Bubblewrap do sistema somente para compilar fonte confiável, com destinos fixos e nenhum destino criado sob o fonte montado. A condição da CVE de setup não foi identificada nesse layout; isso não aceita o binário antigo para usos arbitrários nem substitui o pré-flight posterior do novo executável.

Durante Meson/Ninja a rede fica em namespace separado, fonte e `/usr` somente leitura, somente build/prefix próprios graváveis e temporários privados. `--wrap-mode=nodownload` impede obtenção de subprojetos. A unidade solicita 2 GiB, swap zero, 64 tarefas, uma CPU e 180 segundos, com encerramento da família; são limites configurados para build, não consumo medido ou prova do executor REA. Selinux permanece auto, sem instalar dependência opcional antecipadamente. Prefix `/output` corresponde ao diretório privado montado e não exige gravar no sistema. A suíte de testes upstream está desativada e a execução de `--version` não comprova os controles de isolamento.

~~~bash
(
  set -eu
  umask 077
  rea_base="$HOME/.local/share/security-workbench"
  rea_bwrap_work="$rea_base/bubblewrap-build-0.13.1"
  rea_bwrap_prefix="$rea_base/bubblewrap-0.13.1"

  test ! -e "$rea_bwrap_work"
  test ! -e "$rea_bwrap_prefix"
  mkdir "$rea_bwrap_work" "$rea_bwrap_prefix"
  cd "$rea_bwrap_work"

  curl --disable --fail --location \
    --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --max-time 60 --max-filesize 1048576 \
    --output bubblewrap-0.13.1.tar.xz \
    https://github.com/containers/bubblewrap/releases/download/v0.13.1/bubblewrap-0.13.1.tar.xz

  printf '%s  %s\n' \
    '0e85c8702248b8dd64144f594147553650cdd0e4c951690345faace79c217c4d' \
    'bubblewrap-0.13.1.tar.xz' | sha256sum --check -

  tar --extract --xz --file bubblewrap-0.13.1.tar.xz \
    --no-same-owner --no-same-permissions
  test -f bubblewrap-0.13.1/meson.build
  mkdir build

  systemd-run --user --quiet --wait --pipe --collect \
    --expand-environment=no \
    --unit=workbench-bwrap-build-0131 \
    -p MemoryMax=2G -p MemorySwapMax=0 \
    -p TasksMax=64 -p CPUQuota=100% \
    -p RuntimeMaxSec=180s -p TimeoutStopSec=2s \
    -p KillMode=control-group -p UMask=0077 \
    -p NoNewPrivileges=yes \
    /usr/bin/env -i PATH=/usr/bin:/bin LANG=C \
    /usr/bin/bwrap \
    --unshare-user --unshare-net --unshare-pid --unshare-ipc --unshare-uts \
    --die-with-parent --new-session --clearenv --cap-drop ALL \
    --ro-bind /usr /usr \
    --symlink usr/bin /bin --symlink usr/lib /lib \
    --symlink usr/lib64 /lib64 \
    --ro-bind "$rea_bwrap_work/bubblewrap-0.13.1" /source \
    --bind "$rea_bwrap_work/build" /build \
    --bind "$rea_bwrap_prefix" /output \
    --proc /proc --dev /dev --tmpfs /tmp \
    --dir /tmp/home \
    --setenv HOME /tmp/home --setenv TMPDIR /tmp \
    --setenv PATH /usr/bin:/bin --setenv LANG C \
    --chdir /build \
    /bin/sh -eu -c '
      meson setup /build /source --prefix=/output \
        --buildtype=release --wrap-mode=nodownload \
        -Dman=disabled -Dbash_completion=disabled \
        -Dzsh_completion=disabled -Dtests=false
      ninja -C /build -j 2
      meson install -C /build --no-rebuild
    ' </dev/null

  test -x "$rea_bwrap_prefix/bin/bwrap"
  test ! -u "$rea_bwrap_prefix/bin/bwrap"
  test ! -g "$rea_bwrap_prefix/bin/bwrap"
  test "$("$rea_bwrap_prefix/bin/bwrap" --version)" = 'bubblewrap 0.13.1'
  "$rea_bwrap_prefix/bin/bwrap" --version
  printf 'binario_sha256='
  sha256sum < "$rea_bwrap_prefix/bin/bwrap"
  printf 'BWRAP_COMPILADO_OK\n'
)
~~~

O operador retornou os sete passos C/link concluídos, instalação em `/output/bin`, versão `bubblewrap 0.13.1`, `BWRAP_COMPILADO_OK` e SHA-256 do binário **`d7e217424a96140625d3e83df81e66a9e91de40ed9f882d07505da99fa005a76`**. Esse digest observado é diferente do digest do tarball. O bloco compilou e instalou somente a ferramenta confiável em prefix privado; não iniciou análise REA. O pré-flight real desse executável e sua disponibilidade de namespaces ainda estão pendentes. Os limites solicitados no build não foram apresentados como medição de consumo nem homologação de recursos do engine.

## Pré-flight do executável privado — aprovado segundo retorno do operador

O helper fixado em `7e2dd120e20cb8f0dbbaca58604ac623d9d40825` tem SHA-256 `8db65c9d81aad084a33efff221876d7e14571719188f6e56e72148e6976fdf02`. O bloco usa nome local novo, confere o binário recém-compilado e o helper antes de invocar o módulo. A sentinela `rea-preflight-wrapper` em argv[1] é necessária: o helper é importado por argv[2], sem acionar sua CLI. A engenharia verificou esse roteamento com retorno antecipado de plataforma não suportada, sem tentar namespaces na cloud.

Os valores cgroup são conferidos dentro da mesma unidade que inicia Node/helper/Bubblewrap. O controle positivo de loopback acontece fora do namespace, mas dentro dessa unidade; o controle negativo acontece dentro da sandbox. `LIMITES_PREFLIGHT_OK` só aparece depois dos três valores esperados. `memory_enforced` e `ready_for_rea` no JSON continuam false por contrato: o helper não prova o futuro engine. Falha de política/namespace permanece bloqueio, sem fallback ou remoção de `NoNewPrivileges`.

O operador forneceu checksum do helper aprovado, `LIMITES_PREFLIGHT_OK` e JSON com `passed:true` e os 12 controles true para esse executável privado. Portanto os limites 536870912/0/32 foram verificados na unidade usada por esse pré-flight, e não somente numa unidade benigna separada. `memory_enforced` e `ready_for_rea` permaneceram false conforme o contrato fixo do helper. Essa prova é de controles com fixture própria; não é compilação/execução REA nem auditoria completa do mecanismo de isolamento. Não houve recusa de namespace no percurso observado.

~~~bash
(
  set -eu
  umask 077
  rea_base="$HOME/.local/share/security-workbench"
  rea_bwrap="$rea_base/bubblewrap-0.13.1/bin/bwrap"
  rea_helper="$rea_base/rea-sandbox-preflight-7e2dd12.mjs"

  test -x "$rea_bwrap"
  test "$("$rea_bwrap" --version)" = 'bubblewrap 0.13.1'
  cd "$rea_base/bubblewrap-0.13.1/bin"
  printf '%s  %s\n' \
    'd7e217424a96140625d3e83df81e66a9e91de40ed9f882d07505da99fa005a76' \
    'bwrap' | sha256sum --check -

  test ! -e "$rea_helper"
  curl --disable --fail --location \
    --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --max-time 60 --max-filesize 65536 \
    --output "$rea_helper" \
    https://raw.githubusercontent.com/ofelipepeixoto/security-workbench/7e2dd120e20cb8f0dbbaca58604ac623d9d40825/scripts/rea-sandbox-preflight.mjs

  cd "$rea_base"
  printf '%s  %s\n' \
    '8db65c9d81aad084a33efff221876d7e14571719188f6e56e72148e6976fdf02' \
    'rea-sandbox-preflight-7e2dd12.mjs' | sha256sum --check -

  systemd-run --user --quiet --wait --pipe --collect \
    --expand-environment=no \
    --unit=workbench-rea-private-preflight \
    -p MemoryMax=512M -p MemorySwapMax=0 \
    -p TasksMax=32 -p CPUQuota=100% \
    -p RuntimeMaxSec=20s -p TimeoutStopSec=2s \
    -p KillMode=control-group -p NoNewPrivileges=yes \
    /usr/bin/env -i LANG=C \
    PATH="$rea_base/node-v24.19.0-linux-x64/bin:/usr/bin:/bin" \
    /bin/sh -eu -c '
      rea_cgroup=$(cut -d: -f3 /proc/self/cgroup)
      test "$(cat "/sys/fs/cgroup${rea_cgroup}/memory.max")" = 536870912
      test "$(cat "/sys/fs/cgroup${rea_cgroup}/memory.swap.max")" = 0
      test "$(cat "/sys/fs/cgroup${rea_cgroup}/pids.max")" = 32
      printf "LIMITES_PREFLIGHT_OK\n"
      exec "$@"
    ' rea-preflight-unit \
    "$rea_base/node-v24.19.0-linux-x64/bin/node" \
    --input-type=module -e '
      import { pathToFileURL } from "node:url";
      const { runPreflight } = await import(pathToFileURL(process.argv[2]).href);
      const result = await runPreflight({ bwrapExecutable: process.argv[3] });
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      process.exitCode = result.passed ? 0 : 2;
    ' rea-preflight-wrapper "$rea_helper" "$rea_bwrap" </dev/null
)
~~~
