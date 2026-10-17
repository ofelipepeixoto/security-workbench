# Security Workbench

Plataforma privada em construção para inspecionar ativos **autorizados**. Esta primeira entrega é um núcleo local, de um operador, que analisa uma cópia de arquivos de um repositório sem executar código do alvo ou enviar arquivos a um serviço externo.

## Primeiro fluxo

Requer Python 3.12. Não há dependências externas nesta etapa.

```bash
python3 -m workbench authorize --repo ofelipepeixoto/rea --confirm-owned
python3 -m workbench scan --repo ofelipepeixoto/rea --snapshot /caminho/para/copia/rea --revision COMMIT_COMPLETO
python3 -m workbench runs
python3 -m workbench report --run ID_DA_ANALISE
python3 -m workbench review --run ID_DA_ANALISE --finding IMPRESSAO_DIGITAL --decision false_positive
python3 -m workbench compare --before ID_ANTERIOR --after ID_NOVO
```

`--snapshot` aponta para arquivos obtidos por um meio já autorizado. A ferramenta **não clona** repositórios, não solicita token, não verifica a posse da conta GitHub e não garante que `--revision` corresponde aos arquivos: o relatório inclui um digest calculado da cópia para conferência. O operador atesta a autorização ao cadastrar o repositório. O banco local fica em `.data/workbench.sqlite3` e é ignorado pelo Git.

Detecções iniciais: possível credencial atribuída em código e configurações de GitHub Actions com permissões amplas. A lista de dependências é apenas um inventário: ainda não há consulta de CVEs. Todo achado começa como `candidate`; só a revisão humana pode confirmá-lo. Valores de possíveis segredos não são salvos nem exibidos.

Arquivos grandes ou binários, pastas de dependências e links simbólicos são ignorados. O relatório informa quando a cobertura é parcial. Leia [escopo e critérios da etapa 1](docs/etapa-1.md) antes de usar. Não use o modo local como serviço público.

## Verificação

```bash
python3 -m unittest discover -s tests -v
```

O alvo fictício em `tests/fixtures/repo` contém valores artificiais. Os testes também verificam autorização, ausência de execução do alvo, redação dos valores, revisão e comparação de análises.
