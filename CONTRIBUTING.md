# Contribuindo com o Security Workbench

Obrigado por ajudar a melhorar este projeto experimental. Abra uma issue para discutir mudanças maiores e envie alterações pequenas por pull request. Leia [o escopo e os limites](README.md) antes de começar.

## Preparar e verificar

- Use Python 3.12 e Node.js compatível com `web/package.json`.
- Rode o núcleo local: `python3 -m unittest discover -s tests -v`.
- Rode os testes do adaptador: `node --test web/tests/*.test.mjs`.
- Use apenas fixtures sintéticas para testes e capturas de tela. Não execute scripts, hooks ou instaladores do repositório analisado.
- A demonstração web usa dados fictícios; a operação hospedada depende da identidade ChatGPT do proprietário e não é requisito para contribuir.
- Execute análises reais apenas em ativos próprios ou com autorização explícita. Documente o escopo e as limitações de cobertura.

## Enviar uma mudança

Descreva o problema, o comportamento esperado, os testes executados e os limites da validação. Envie PR para `main`. Para novos detectores, inclua evidência, impacto, confiança e recomendação; mantenha observações como candidatas até revisão humana. Prefira alterações reproduzíveis e sem serviço pago obrigatório.

Nunca anexe tokens, senhas, bancos locais, relatórios de terceiros, código privado de alvos ou capturas sensíveis em commits, issues, PRs ou logs. Se encontrar uma falha de segurança no próprio Workbench, siga [SECURITY.md](SECURITY.md).
