# ExecPlan — M0: Fundação

## Status

Concluído em 2026-08-09.

## Propósito e resultado

Criar uma fundação local executável para o TELME ACS: monorepo pnpm com TypeScript estrito, API NestJS, Web Next.js, worker BullMQ, pacotes de domínio e integração, Prisma, infraestrutura Docker, health checks e comandos unificados de qualidade.

O resultado permite instalar dependências, subir a infraestrutura, iniciar os três aplicativos e executar lint, typecheck, testes e build a partir da raiz.

## Estado inicial

O repositório continha apenas `AGENTS.md`. Não havia código, configuração, credenciais, capturas de CPE ou mapeamentos IXC/TR-069 verificados.

## Escopo entregue

- workspace pnpm e configuração TypeScript compartilhada;
- `apps/api`, `apps/web` e `apps/worker`;
- `packages/contracts`, `device-model`, `device-adapters`, `genieacs-client` e `ixc-client`;
- configuração Prisma 7 validável, sem antecipar os modelos do M4;
- PostgreSQL, Redis, MongoDB privado e quatro serviços GenieACS em Docker Compose;
- `.env.example` somente com valores locais fictícios;
- health checks da API, Web, worker e containers;
- scripts raiz para desenvolvimento, formatação, build, lint, typecheck e testes;
- README e ADR da fronteira GenieACS/TELME.

Ficaram fora do M0: autenticação, integração HTTP real com IXC/GenieACS, operações em CPE, modelos Prisma de negócio, mapeamentos de equipamento, firmware e implantação de produção.

## Premissas e desconhecidos

- Os aplicativos rodam no host; o Compose fornece apenas dependências locais.
- Credenciais reais serão fornecidas por ambiente ou cofre, nunca pelo Git.
- Capacidades e paths específicos de HGUs permanecem `unknown` até captura ou documentação válida.
- A API responde em `http://localhost:3101/api/v1/health` e a Web em `http://localhost:3000/api/health`.
- O worker não abre um servidor HTTP; seu script de health faz ping no Redis.
- O ambiente TELME ainda precisa fornecer mapeamentos IXC, capturas sanitizadas de CPE e credenciais de laboratório.

## Componentes afetados

```text
apps/{api,web,worker}
packages/{contracts,device-model,device-adapters,genieacs-client,ixc-client}
prisma/
infrastructure/docker/
genieacs/
docs/adr/
.agent/
configurações e scripts da raiz
```

## Validação observada

Executada em 2026-08-09:

| Verificação                            | Resultado                                            |
| -------------------------------------- | ---------------------------------------------------- |
| `pnpm install`                         | dependências instaladas e `pnpm-lock.yaml` gerado    |
| `pnpm format:check`                    | passou                                               |
| `pnpm lint`                            | passou                                               |
| `pnpm typecheck`                       | passou nos 8 workspaces                              |
| `pnpm test`                            | passou nos testes unitários e de adapters            |
| `pnpm test:integration`                | passou no endpoint HTTP da API                       |
| `pnpm build`                           | passou, incluindo build de produção do Next.js       |
| `pnpm db:validate`                     | schema Prisma válido                                 |
| `pnpm db:generate`                     | cliente Prisma gerado na pasta ignorada `generated/` |
| `pnpm audit --prod --audit-level high` | nenhuma vulnerabilidade conhecida encontrada         |
| `docker compose config --quiet`        | passou                                               |
| `docker compose up -d --build --wait`  | todos os 7 containers ficaram saudáveis              |
| API/Web/worker health                  | responderam `status: ok`                             |
| GenieACS UI/NBI                        | UI respondeu HTTP 200; NBI respondeu lista vazia     |

O host de validação usa Node.js 26. O Prisma 7 suporta oficialmente as linhas 20, 22 e 24; por isso o projeto fixa Node.js 24 LTS em `engines`, embora os comandos tenham funcionado no host disponível.

Após a validação, containers e volumes criados com credenciais fictícias foram removidos; a imagem local do GenieACS permaneceu em cache.

## Descobertas

- Não há dados reais suficientes para declarar suporte a qualquer modelo de CPE.
- O M0 pode registrar capacidades `unknown` e inspecionar fixtures sanitizadas sem inventar paths de hardware.
- A porta 3001 já estava ocupada no host; a API adotou 3101 como padrão.
- O pnpm 11 exige uma allowlist explícita de scripts de dependências. Prisma/esbuild foram autorizados e o módulo nativo opcional `msgpackr-extract` foi negado.

## Decisões

- 2026-08-09: manter o Compose restrito à infraestrutura para simplificar hot reload.
- 2026-08-09: não criar modelos Prisma antes do M4.
- 2026-08-09: instalar o pacote oficial `genieacs@1.2.16` em uma imagem local e executar `cwmp`, `nbi`, `fs` e `ui` separadamente.
- 2026-08-09: limitar bancos, Redis, NBI, FS e UI ao loopback; CWMP também usa loopback por padrão e exige configuração explícita para laboratório.
- 2026-08-09: manter clientes GenieACS/IXC como contratos no M0; implementações HTTP pertencem ao M1/M3.
- 2026-08-09: manter todas as capacidades do adapter genérico como `unknown` e não adicionar paths específicos sem evidência.

## Progresso

- [x] Inspecionar o repositório e registrar o plano.
- [x] Configurar workspace e ferramentas.
- [x] Criar aplicativos e health checks.
- [x] Criar pacotes iniciais e discovery sanitizado.
- [x] Criar Prisma e infraestrutura local.
- [x] Documentar a fronteira GenieACS/TELME.
- [x] Executar e registrar validações.

## Trabalho restante

O M0 não tem trabalho pendente. O próximo milestone é o M1: cliente GenieACS tipado com lookup, refresh, escrita, reboot e estados de task, usando NBI mockada nos testes.
