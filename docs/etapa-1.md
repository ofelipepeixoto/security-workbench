# Etapa 1 — escopo e critérios

## Objetivo

Demonstrar a jornada cadastrar escopo autorizado → analisar uma cópia local de um repositório → revisar achados → obter relatório → comparar histórico. O primeiro alvo real permitido pelo proprietário é `ofelipepeixoto/rea`; a execução de demonstração pode analisar apenas um subconjunto e deve declarar essa limitação. Dados fictícios exercitam os detectores sem expor credenciais.

## Limites desta entrega

- Um operador em ambiente local. `authorize --confirm-owned` registra uma declaração explícita, sem autenticação GitHub. O diretório local deve vir de uma fonte confiável; não confiar em rótulo de commit fornecido manualmente.
- Inspeção estática somente. Não instalar dependências nem executar código, hooks ou workflows do repositório alvo.
- Sem conexão com GitHub a partir da aplicação, sem REA, sem varredura de sites e sem automação n8n nesta etapa. O conector GitHub pode fornecer uma amostra controlada para a demonstração, separada da execução normal do produto.
- Achados são **candidatos** baseados em padrões e exigem revisão humana. Inventário de dependências não é auditoria de CVEs. Nenhuma ausência de achados representa garantia de segurança.
- Sem serviço externo, publicação, Supabase ou custo recorrente. SQLite local ignorado pelo Git. Nunca versionar capturas, tokens, sessões ou banco de dados.

## Critérios de aceite

1. Sem cadastro explícito do repositório, a análise é recusada.
2. Um alvo fictício gera ao menos um achado candidato com caminho, linha, evidência redigida, confiança, impacto e recomendação, além de inventário de dependências.
3. Código, links simbólicos e instaladores do alvo não são executados. Arquivos fora da raiz e diretórios ignorados não entram na análise.
4. Relatório não contém o valor de uma credencial fictícia. Resultado marca cobertura parcial se ultrapassar limites ou se for uma amostra declarada.
5. Revisão humana muda o estado do achado sem alterar evidência, e comparação entre duas execuções indica achados novos e resolvidos.
6. Suíte local passa e o PR descreve exatamente o que foi e não foi validado.

## Ameaças e próximos incrementos

O operador pode fornecer um diretório com symlinks, arquivos enormes ou conteúdo malicioso; por isso há limites de leitura e caminhos, nenhuma importação de módulos alvo e nenhuma execução de comandos do alvo. O valor suspeito de credencial é descartado antes de persistir. SQLite local requer proteção do computador e backup adequado para uso real.

O próximo incremento deve adicionar aquisição GitHub somente leitura com identidade de repositório e commit verificadas, limites de API e credenciais mantidas fora do chat. Depois vêm uma interface com autenticação privada, REA sobre artefatos fornecidos e um coletor de sites com proteção contra SSRF e redirecionamentos fora de escopo. Cada uma dessas capacidades exige testes próprios antes de operar fora de loopback.

## Referência de produto

Documentação pública do GitGuard descreve análise de código, pacotes, segredos, SBOM, triagem e exportação. Esse material inspira requisitos funcionais; nenhuma observação sobre seu backend foi feita e não há varredura ativa do serviço. O produto próprio terá identidade, código e interface independentes.
