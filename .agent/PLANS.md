# ExecPlans do TELME ACS

Use um ExecPlan para funcionalidades, refatorações ou migrações que atravessem mais de um componente. O documento deve permitir que outra pessoa continue o trabalho usando apenas o repositório e o próprio plano.

## Conteúdo obrigatório

Cada plano em `.agent/plans/` deve registrar:

1. propósito e resultado observável;
2. estado inicial relevante;
3. escopo e itens fora do escopo;
4. premissas e informações desconhecidas;
5. componentes afetados;
6. marcos de implementação;
7. comandos de validação e resultados observados;
8. descobertas;
9. decisões e justificativas;
10. progresso e trabalho restante.

## Regras de manutenção

- Atualize `Progresso`, `Descobertas` e `Decisões` quando o estado mudar.
- Diferencie claramente o que foi executado do que ainda é esperado.
- Registre bloqueios concretos sem substituir implementação disponível por planejamento.
- Use datas no formato `YYYY-MM-DD` e comandos executáveis a partir da raiz.
- Não registre segredos, dados de assinantes nem caminhos TR-069 não verificados.
- Ao concluir, resuma o resultado e mantenha pendências explícitas.

O primeiro plano do projeto é o [M0 — Fundação](plans/m0-foundation.md).
