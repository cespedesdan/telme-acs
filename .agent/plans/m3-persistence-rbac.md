# ExecPlan — M3: Persistência e RBAC

## Status

Concluído em 2026-08-10.

## Propósito e resultado

Entregar a persistência PostgreSQL pertencente ao TELME ACS e um RBAC baseado em permissões, sem dependência do IXC. Ao final, usuários, devices, capabilities, operações, vínculos externos opcionais e auditoria terão schema migrável e cliente tipado; as decisões de acesso serão testáveis sem banco ou aplicação Web.

## Estado inicial

M0–M2 estão concluídos. O projeto já possui PostgreSQL no Compose, Prisma 7.9.1 configurado e generator com output explícito, mas o schema não contém modelos. Não existe pacote de autorização nem cliente PostgreSQL utilizável pela aplicação.

## Escopo

- schema e migration inicial do PostgreSQL;
- usuários com uma role inicial e estado ativo;
- catálogo de permissões e matriz das seis roles;
- devices independentes de qualquer integração comercial;
- capabilities por device;
- operações com os quatro estados normalizados;
- audit logs com summaries seguros e correlation/task IDs;
- identificadores externos e histórico de vínculos opcionais;
- cliente Prisma 7 usando o adapter oficial do PostgreSQL;
- testes unitários de autorização e teste de integração da persistência quando PostgreSQL local estiver disponível;
- documentação da decisão e comandos de banco.

Ficam fora: login/JWT/sessão, endpoints de device, interface Web, captura de HGU, integração ou campos obrigatórios do IXC, seed de usuário administrativo e retenção de métricas.

## Premissas e desconhecidos

- Uma pessoa possui uma role por vez no M3; permissões continuam sendo a unidade de autorização.
- Permissões ficam versionadas em código e a role fica persistida, evitando seed e drift de tabelas de ACL neste estágio.
- Email é normalizado para minúsculas pela futura camada de autenticação antes de persistir.
- `ExternalIdentifier` é genérico e opcional; nenhum nome ou identificador do IXC entra no modelo central.
- Senhas serão armazenadas apenas como hash, mas hashing e autenticação pertencem ao fluxo de login futuro.
- O Docker local pode exigir permissão fora da sandbox; schema, geração, testes unitários e build não dependem dele.

## Componentes afetados

```text
prisma/
packages/auth/
packages/persistence/
package.json
pnpm-lock.yaml
README.md
docs/adr/
```

## Marcos

1. Modelar invariantes e índices no Prisma.
2. Gerar e revisar a migration SQL inicial.
3. Implementar RBAC estático com negação por padrão e erro de domínio.
4. Implementar a criação explícita do Prisma Client com driver PostgreSQL.
5. Testar permissões, geração, migration e relações/constraints em PostgreSQL.
6. Documentar e executar lint, typecheck, testes, build e audit.

## Validação

```bash
pnpm db:format
pnpm db:validate
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm audit --prod --audit-level high
```

Resultados observados em 2026-08-10:

- `pnpm db:format`: passou;
- `pnpm db:validate`: schema válido;
- `pnpm db:generate`: Prisma Client 7.9.1 gerado;
- `pnpm db:migrate:deploy`: migration aplicada em PostgreSQL 17 descartável e segunda execução sem pendências;
- `pnpm lint`: passou;
- `pnpm format:check`: passou;
- `pnpm typecheck`: passou nos 10 workspaces aplicáveis;
- `pnpm test`: passou, 29 testes unitários;
- `pnpm test:integration`: passou, 1 teste HTTP da API e 1 teste PostgreSQL do M3;
- `pnpm build`: passou, incluindo Prisma Client e build de produção do Next.js;
- `pnpm audit --prod --audit-level high`: nenhuma vulnerabilidade conhecida;
- inspeção por padrões sensíveis: nenhum path de fabricante, chave privada ou campo `ixc_*` no core do M3.

## Descobertas

- O Prisma 7 exige um driver adapter para conexões diretas; PostgreSQL usará `@prisma/adapter-pg` e `pg`.
- `prisma migrate dev` não executa mais `prisma generate` automaticamente no Prisma 7.
- O teste integrado comprovou que um device persiste e recebe operações/auditoria com zero bindings externos.
- Serial isolado não é identidade global suficiente; o schema o indexa para busca, mas mantém `id` TELME e `genieAcsId` como identidades únicas.

## Decisões

- 2026-08-10: manter matriz role → permissions em `@telme/auth`; persistir apenas a role do usuário no M3.
- 2026-08-10: representar integrações futuras por identificador externo genérico e vínculo histórico opcional, sem campos `ixc_*`.
- 2026-08-10: preservar operações, auditorias e histórico de vínculos com relações restritivas ou nullable, em vez de cascatas destrutivas.
- 2026-08-10: permitir geração/validação do schema sem segredo local usando uma URL `.invalid`; conexões e migrations reais continuam exigindo `DATABASE_URL`.

## Progresso

- [x] Reler as instruções atualizadas e inspecionar M0–M2.
- [x] Registrar o plano.
- [x] Implementar schema e migration.
- [x] Implementar autorização e cliente de persistência.
- [x] Adicionar testes.
- [x] Atualizar documentação.
- [x] Executar e registrar validações.

## Trabalho restante

M3 não possui trabalho pendente. Login/JWT e endpoints continuam deliberadamente fora deste milestone. O próximo marco é M4 e depende de captura sanitizada e acesso a um HGU de laboratório para declarar o primeiro modelo realmente suportado.
