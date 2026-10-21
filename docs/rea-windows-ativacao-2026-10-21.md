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

  test "$(git -C "$rea_checkout" rev-parse HEAD)" = \
    3e7c6302233ecbcb9b92e43ee5a60337738961bd
  test -z "$(git -C "$rea_checkout" status --porcelain)"

  systemd-run --user --quiet --wait --pipe --collect \
    --expand-environment=no \
    --unit=workbench-rea-compile \
    -p MemoryMax=2G -p MemorySwapMax=0 \
    -p TasksMax=128 -p CPUQuota=100% \
    -p RuntimeMaxSec=600s -p TimeoutStopSec=2s \
    -p KillMode=control-group -p UMask=0077 \
    -p NoNewPrivileges=yes \
    /usr/bin/bwrap \
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
  done

  git diff --exit-code --quiet
  printf '%s  %s\n' \
    '4d298e57d8424a14208f470446be51a0f61cdd932650059557acd5bc21009eb6' \
    'package-lock.json' | sha256sum --check -
  printf 'RUNTIME_COMPILADO_OK\n'
)
~~~

Esse comando foi revisado no código fixado; ainda não foi executado no ambiente do operador. Os limites pedidos para compilação não substituem a verificação dos limites efetivos no executor da futura análise.

## Atualização do gate Bubblewrap

A versão curta `bwrap --version` não informa o pacote completo nem eventuais patches da distribuição. O [aviso oficial GHSA-pxhw-h44j-8pfx / CVE-2026-87766](https://github.com/containers/bubblewrap/security/advisories/GHSA-pxhw-h44j-8pfx) afeta versões upstream anteriores a 0.12.0: durante o setup, criar destinos sob conteúdo de filesystem controlado por atacante pode seguir symlinks para fora. Não foi observada exploração e essa condição não foi identificada no layout fixo acima, que não cria descendentes dentro de `/tool`. Isso não autoriza usos arbitrários do Bubblewrap.

O [USN-8779-2](https://ubuntu.com/security/notices/USN-8779-2), de 18/09/2026, informa a reversão do patch anterior por regressão. Portanto o USN-8779-1 sozinho não prova uma correção atual. Antes de aceitar entradas não confiáveis, obter a identificação completa e consultar a correção aplicável; não atualizar a distribuição, instalar PPA ou substituir o binário implicitamente:

~~~bash
dpkg-query -W -f='${Package} ${Version}\n' bubblewrap
apt-cache policy bubblewrap
~~~

Esses dois comandos são somente leitura. O operador retornou pacote instalado e candidato `0.11.1-1ubuntu0.1`, nos índices locais de `resolute-updates/main` e `resolute-security/main` amd64. A data de atualização desses índices não foi verificada. Essa versão não comprova a correção; o gate para entradas não confiáveis permanece aberto. Atualizar os índices oficiais e simular somente o upgrade do pacote é o próximo passo; nenhuma atualização de pacote foi realizada. Mesmo um candidato `0.11.1-1ubuntu0.3` não resolve este aviso, pois corresponde à reversão documentada no USN-8779-2. As 12 verificações aprovadas do helper continuam válidas para a fixture própria usada, sem constituir auditoria do Bubblewrap ou prontidão para entradas adversariais.
