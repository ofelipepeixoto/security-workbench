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
