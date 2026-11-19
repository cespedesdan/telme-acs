# ExecPlan — M1/M2: Cliente GenieACS e device adapters

## Status

Concluído em 2026-08-10.

## Propósito e resultado

Entregar o cliente tipado da NBI do GenieACS e a base de normalização/adapters que impede controllers e UI de dependerem de paths CWMP. O resultado observável será um conjunto de operações GenieACS testadas com transporte mockado e adapters genéricos capazes de classificar árvores TR-098/TR-181 sem declarar suporte de hardware não verificado.

## Estado inicial

O M0 fornece pacotes compiláveis, mas `genieacs-client` contém apenas interfaces e `device-adapters` concentra um registry mínimo em um único arquivo. Não há implementação HTTP, parsing de respostas, fixture sanitizada em disco nem helpers separados para TR-098/TR-181.

## Escopo

- lookup tipado de devices pela NBI;
- criação e consulta de tasks;
- refresh de parâmetros, escrita de valores, reboot, factory reset e download;
- mapeamento fiel de HTTP 200 para `executed` e HTTP 202 para `queued`;
- timeout, indisponibilidade, respostas inválidas e erros HTTP seguros;
- modelo normalizado ampliado e criação consistente de capabilities;
- interfaces de adapter e registry com fallback genérico;
- classificação de árvores TR-098, TR-181, híbridas ou desconhecidas;
- parsing de fixtures e fixture sintética sanitizada apenas para teste;
- testes unitários/mockados, README e ADR de adapters.

Ficam fora: controllers/endpoints da API TELME, persistência, autenticação/RBAC, integração IXC, polling, mappings de modelos reais e qualquer operação em CPE de produção.

## Premissas e desconhecidos

- A NBI segue a API estável do GenieACS 1.2.16.
- Basic Auth é opcional e configurado somente por ambiente.
- Paths entregues a refresh/escrita já devem ter sido verificados pelo adapter chamador; o client não inventa nem interpreta paths.
- A ausência de uma task na coleção não prova execução; `getTask` retornará `null` em vez de fabricar um estado.
- Sem capturas reais, todos os recursos do adapter genérico permanecem `unknown`.

## Componentes afetados

```text
packages/genieacs-client/
packages/device-model/
packages/device-adapters/
docs/adr/
docs/devices/
README.md
```

## Marcos

1. Implementar transporte NBI e operações tipadas.
2. Testar URLs, encoding, autenticação, payloads e estados de task.
3. Evoluir o modelo normalizado e capabilities.
4. Separar adapter registry, contexto, helpers genéricos e fixtures.
5. Documentar decisões/limitações e executar todas as validações.

## Validação

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm audit --prod --audit-level high
```

Resultados observados em 2026-08-10:

- `pnpm format:check`: passou;
- `pnpm lint`: passou;
- `pnpm typecheck`: passou nos 8 workspaces aplicáveis;
- `pnpm test`: passou, 21 testes unitários no total;
- `pnpm test:integration`: passou, 1 teste HTTP da API;
- `pnpm build`: passou, incluindo o build de produção do Next.js;
- `pnpm audit --prod --audit-level high`: nenhuma vulnerabilidade conhecida;
- inspeção por padrões sensíveis nos arquivos de M1/M2: nenhum path de fabricante, chave privada ou token preenchido encontrado.

## Descobertas

- A documentação estável da NBI diferencia execução imediata (200) de task enfileirada (202).
- Consultar a coleção de tasks mostra pendências, mas a ausência do registro não comprova que a task foi executada.

## Decisões

- 2026-08-10: usar `fetch`, `AbortSignal.timeout`, `URL` e `Headers` nativos do Node.js 24; nenhuma dependência HTTP nova.
- 2026-08-10: injetar o transporte `fetch` no client para testes determinísticos sem GenieACS real.
- 2026-08-10: manter fixture sintética explicitamente marcada como não representativa de equipamento real.
- 2026-08-10: uma task ainda presente na coleção é exposta apenas como `queued`; a ausência retorna `null`, pois não comprova execução.
- 2026-08-10: o fallback genérico identifica somente raízes TR-098/TR-181 e não promove capabilities sem captura revisada.

## Progresso

- [x] Inspecionar o estado inicial e registrar o plano.
- [x] Implementar e testar M1.
- [x] Implementar e testar M2.
- [x] Atualizar documentação.
- [x] Executar e registrar validações finais.

## Trabalho restante

M1 e M2 não têm trabalho pendente. O próximo marco é M3 (cliente IXC). A validação de paths reais e de comportamento em CPE continua bloqueada corretamente até existirem capturas sanitizadas e equipamento de laboratório.
