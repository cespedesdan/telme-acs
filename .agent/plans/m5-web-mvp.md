# ExecPlan — M5: Web MVP

## Propósito e resultado observável

Entregar uma interface em português para autenticar um operador, pesquisar HGUs, abrir detalhes normalizados, ler/alterar SSID quando validado, solicitar refresh/reboot e consultar operações/auditoria. O fluxo deve funcionar sem IXC.

## Estado inicial

Em 2026-08-12 a API possui somente health check e a Web mostra apenas a fundação. M3 fornece schema PostgreSQL/RBAC e M4 fornece adapter real do HG8145V5 `15AD.A / V5R020C00S270`. GenieACS, PostgreSQL e Redis locais estão ativos; quatro HGUs reais informam ao ACS.

## Escopo

- autenticação local por usuário PostgreSQL e cookie assinado;
- bootstrap administrativo por comando explícito;
- sincronização de identidade/capabilities GenieACS → PostgreSQL;
- busca por identificadores locais conhecidos;
- detalhe normalizado, Wi-Fi, óptica e WAN;
- escrita de SSID validada, refresh e reboot;
- persistência de operação e auditoria;
- UI responsiva em pt-BR com estados verdadeiros.

## Fora do escopo

- IXC e dados de cliente;
- recuperação de senha, MFA e SSO;
- alteração de senha Wi-Fi;
- adapters adicionais;
- factory reset, firmware e operações em massa;
- confirmação assíncrona avançada de tasks por worker.

## Premissas e desconhecidos

- somente a revisão HG8145V5 validada terá ações habilitadas;
- outros modelos aparecem pelo adapter genérico com capabilities `unknown`;
- task HTTP 202 permanece `queued`; ausência posterior da fila, isoladamente, não prova aplicação;
- o primeiro administrador será criado por comando usando segredo em variável de ambiente.

## Componentes afetados

```text
apps/api
apps/web
packages/auth
packages/contracts
packages/device-adapters
.env.example
README.md
docs/adr
```

## Marcos

1. Normalizar resposta NBI no pacote de adapters.
2. Implementar senha/sessão e bootstrap administrativo.
3. Implementar API autenticada e auditada.
4. Implementar página operacional.
5. Testar com upstreams mockados e serviços locais.
6. Atualizar documentação e executar checks completos.

## Validação planejada

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

## Descobertas

- O scaffold não possui autenticação nem controllers de domínio.
- O schema M3 já cobre todos os registros necessários ao M5 sem nova migration.
- Next.js pode encaminhar `/api/v1/*` para a API, mantendo cookie same-origin e evitando CORS.
- A validação real encontrou cinco devices pela NBI e abriu o HG8145V5 com WAN, óptica e duas bandas Wi-Fi normalizadas.
- O teste responsivo em viewport de 390 px não apresentou overflow horizontal.

## Decisões

- Usar `scrypt` e HMAC SHA-256 nativos do Node; nenhuma dependência de autenticação nova.
- Consultar role/estado do usuário no banco em cada request autenticada, permitindo revogação imediata.
- Persistir somente resumos seguros; SSIDs não entram em audit logs.
- Reutilizar o registry e deixar ações desabilitadas quando capability não estiver validada.

## Progresso

- [x] Inspecionar estado inicial.
- [x] Criar ExecPlan.
- [x] Normalizar devices da NBI no pacote de adapters.
- [x] Implementar autenticação e bootstrap.
- [x] Implementar API de devices/operações/auditoria.
- [x] Implementar Web MVP.
- [x] Validar fluxo e atualizar documentação.

## Trabalho restante

Concluído em 2026-08-12. `format`, `lint`, `typecheck`, testes unitários, integração HTTP e build passaram. O teste PostgreSQL destrutivo permaneceu corretamente ignorado sem `TEST_DATABASE_URL`; a migration foi aplicada e o fluxo local real foi validado separadamente.
