# TELME ACS

Plataforma interna da TELME FIBRA para gestão de CPEs/HGUs. O GenieACS executa TR-069/CWMP; o TELME ACS fornece a camada de negócio, integração com o IXC, modelo normalizado, operações seguras, auditoria e interface em pt-BR para NOC e suporte.

Os milestones **M0 a M5** estão concluídos. O M6 adiciona suporte por revisão real: HG8145V5 validado; RTF8225VW REV3 com leituras verificadas; RTF8225VW-SV REV4 e GPT-2742GX4X5v6 parciais enquanto aguardam árvores completas.

## Arquitetura

```text
CPE/HGU -> GenieACS -> TELME ACS API -> PostgreSQL
                         |          -> Redis/BullMQ
                         v
                    TELME ACS Web

Integração IXC (opcional, M7) ------> TELME ACS API
```

Regras centrais:

- o TELME ACS usa a NBI/API e os mecanismos de extensão do GenieACS, nunca o MongoDB interno;
- o IXC é a fonte de verdade para dados comerciais e de assinantes;
- caminhos TR-069 ficam em adapters e só são usados quando verificados;
- capacidade `unknown` não significa `unsupported`;
- operação `queued` não significa configuração aplicada;
- devices e operações funcionam sem qualquer vínculo com o IXC;
- segredos de produção nunca pertencem ao Git.

Veja a [ADR-0001](docs/adr/ADR-0001-genieacs-boundary.md), a [ADR-0002](docs/adr/ADR-0002-device-adapters.md), a [ADR-0003](docs/adr/ADR-0003-persistence-rbac.md) e a [ADR-0004](docs/adr/ADR-0004-local-authentication.md).

## Requisitos locais

- Node.js 24 LTS;
- pnpm 11, na versão indicada em `packageManager`;
- Docker Engine com Docker Compose.

## Início rápido

Na raiz do repositório, no PowerShell:

```powershell
pnpm.cmd install --frozen-lockfile
if (!(Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
```

Não sobrescreva um `.env` existente. Antes de iniciar, substitua os segredos de exemplo por valores próprios. Se outro PostgreSQL ocupar 5432, escolha uma porta livre e mantenha `POSTGRES_PORT` e `DATABASE_URL` sincronizados (este ambiente usa 5433).

O Compose contém apenas a infraestrutura; API, Web e worker rodam no host para manter o hot reload simples. A imagem local do GenieACS instala a versão oficial `1.2.16` publicada no npm e executa `cwmp`, `nbi`, `fs` e `ui` como serviços separados.

Inicie a infraestrutura e aplique as migrations. Crie um operador apenas no primeiro uso, com os valores configurados no ambiente local, e então inicie as aplicações:

```powershell
docker compose up -d --build --wait
pnpm.cmd db:migrate:deploy
pnpm.cmd admin:create
pnpm.cmd dev
```

Nas inicializações seguintes, não recrie o operador. Abra `http://127.0.0.1:3010` (porta do `pnpm dev`). A Web encaminha `/api/v1/*` para a API no host indicado por `API_INTERNAL_URL`, mantendo a sessão em cookie `HttpOnly`. `SESSION_SECRET` precisa de pelo menos 32 bytes aleatórios. Iniciar CWMP pode executar tarefas já pendentes; para testes sem HGU, siga o roteiro antes do IXC e mantenha esse serviço parado.

Portas padrão:

- Web (`pnpm dev`): `http://localhost:3010`; build estável (`pnpm start`): `WEB_PORT`, padrão 3000;
- API: `http://localhost:3101`;
- GenieACS UI: `http://localhost:3002`;
- GenieACS CWMP: `127.0.0.1:7547`;
- GenieACS NBI e FS: somente loopback;
- PostgreSQL e Redis: somente loopback;
- MongoDB: somente na rede privada do Compose.

Para conectar um CPE de laboratório, altere `GENIEACS_CWMP_BIND_ADDRESS` para o IP da interface controlada e limite o acesso na rede. Os valores de `.env.example` são fictícios e não devem ser usados em produção.

Para inspecionar ou encerrar a infraestrutura:

```bash
docker compose ps
docker compose logs -f
docker compose down
```

## Health checks

Roteiro de estabilização, configuração Windows e testes seguros: [validação antes do IXC](docs/testing/pre-ixc-validation.md). Pesquisa delegada: [melhorias ACS](docs/architecture/acs-improvements-research.md).

Para instalar em VM de nuvem sem Cloudflare Tunnel: [homologação convencional em nuvem](docs/testing/cloud-homologation.md). Inclui templates systemd e Nginx HTTPS, sem publicar banco/NBI nem iniciar testes em CPE automaticamente.

Resultado da execução local e gates restantes: [homologação de 2026-10-07](docs/testing/2026-10-07-homologation-results.md).

Para rodar builds estáveis no host (Windows ou Linux), executar `pnpm build` e depois `pnpm start`. A Web usa o entrypoint standalone, com static/public preparados pelo build; `WEB_HOST` padrão é `127.0.0.1` e `WEB_PORT` é `3000`. API/worker usam builds compilados. Docker, migrations e bootstrap de usuários são passos separados; `start` não os executa.

Com os serviços em execução:

- API: `GET http://localhost:3101/api/v1/health`;
- PostgreSQL/NBI: `GET http://localhost:3101/api/v1/health/ready` (503 se degradado);
- Web: `GET http://localhost:3000/api/health`;
- worker/Redis: `pnpm --filter @telme/worker health` depois de build e startup; confirma PING e consumo de um job de sistema, sem enviar comandos a CPEs.

Essas verificações confirmam apenas a fundação local; não comprovam conectividade com CPEs ou com o IXC de produção.

## Comandos do workspace

| Comando                  | Finalidade                     |
| ------------------------ | ------------------------------ |
| `pnpm dev`               | Inicia API, Web e worker       |
| `pnpm start`             | Inicia builds estáveis no host |
| `pnpm build`             | Gera builds dos workspaces     |
| `pnpm lint`              | Executa análise estática       |
| `pnpm typecheck`         | Valida TypeScript estrito      |
| `pnpm test`              | Executa testes unitários       |
| `pnpm test:integration`  | Executa o teste HTTP da API    |
| `pnpm format:check`      | Valida formatação              |
| `pnpm db:validate`       | Valida a configuração Prisma   |
| `pnpm db:generate`       | Gera o cliente Prisma          |
| `pnpm db:migrate:dev`    | Cria/aplica migrations locais  |
| `pnpm db:migrate:deploy` | Aplica migrations existentes   |
| `pnpm admin:create`      | Cria/atualiza operador inicial |

O Prisma lê `DATABASE_URL` do ambiente. Use `db:migrate:dev` somente em desenvolvimento; produção e CI aplicam migrations existentes com `db:migrate:deploy`.

## M1 e M2

`@telme/genieacs-client` encapsula consultas e tasks da NBI. O client oferece lookup, refresh, escrita de valores, reboot, factory reset, download e consulta de task. HTTP 200 significa `executed`; HTTP 202 significa apenas `queued` para o próximo contato do CPE. Os testes usam transporte mockado e não precisam de uma instância real do GenieACS.

Esse resultado do client descreve a resposta do RPC. Na API TELME, mesmo uma resposta imediata continua pendente até a evidência definida pela operação; SSID exige leitura posterior e reboot exige BOOT observado. Enviar `Idempotency-Key` com UUID nas operações. Veja a [ADR-0005](docs/adr/ADR-0005-durable-operation-confirmation.md).

`@telme/device-model` define identidade, data model e capabilities normalizadas. `@telme/device-adapters` fornece registry, fallback genérico, detecção TR-098/TR-181, leitores tipados para paths fornecidos pelo chamador e o mecanismo de fixtures. Consulte o [workflow e a matriz de suporte](docs/devices/README.md) antes de adicionar um equipamento.

Nenhum helper genérico escolhe caminhos de Wi-Fi, óptica, WAN ou fabricante. Esses caminhos só entram em um adapter depois de evidência sanitizada e revisão.

## M3

`@telme/persistence` fornece o Prisma Client 7 com o adapter PostgreSQL oficial. O schema persiste usuários, devices, capabilities, operações, auditoria e vínculos externos opcionais. Um device pode existir, receber operações e ser auditado sem nenhuma relação comercial.

`@telme/auth` mantém a matriz das roles `ADMIN`, `NOC`, `SUPPORT_L2`, `SUPPORT_L1`, `FIELD_TECHNICIAN` e `READ_ONLY`. A role fica no banco; permissões ficam versionadas no código e toda decisão nega por padrão. Consulte a [matriz de RBAC](docs/security/rbac.md).

Para executar o teste PostgreSQL do pacote de persistência, aplique a migration em um banco descartável e defina `TEST_DATABASE_URL`. O teste apaga apenas os dados desse banco, portanto nunca aponte a variável para desenvolvimento ou produção.

## M4

O Huawei HG8145V5 com hardware `15AD.A` e firmware `V5R020C00S270` possui fixture sanitizada e adapter testado. Identidade, último contato, WAN, potência óptica, leitura/escrita dos SSIDs 2,4/5 GHz e reboot foram validados no equipamento real. Consulte o [dossiê do modelo](docs/devices/huawei-hg8145v5/README.md), a [validação de laboratório](docs/devices/huawei-hg8145v5/lab-validation.md) e o [ExecPlan do M4](.agent/plans/m4-first-verified-hgu.md).

## M5

A Web MVP funciona sem IXC e oferece login, visão operacional da rede, filtros por estado, busca local, diagnóstico resumido, detalhe normalizado, Wi-Fi, óptica, WAN, refresh, reboot, estado de operação e histórico auditável. Os indicadores usam somente dados reais do inventário e do último Inform. Escritas só são habilitadas quando o adapter declara a capability verificada. Um HTTP 202 do GenieACS aparece como aguardando contato, nunca como aplicado.

O fluxo HTTP possui testes com autenticação e serviços simulados; a interface não acessa paths TR-069 nem a MongoDB do GenieACS. Consulte o [ExecPlan do M5](.agent/plans/m5-web-mvp.md).

## M6 — em andamento

Fixtures sanitizadas e adapters específicos foram adicionados para RTF8225VW REV3/V2.9, RTF8225VW-SV REV4/V2.39 e GPT-2742GX4X5v6/hw2/b14. HG8145V5, RTF REV3 e GPT agora normalizam IPv6 real e a Web distingue IPv4, IPv6 e dual stack. A REV3 normaliza seis WLANs, `UNIQUE_SSID` e associações. O painel já possui o fluxo seguro de senha Wi-Fi, mas ele permanece bloqueado como `experimental` até mudança e restauração controladas. A árvore do RTF-SV ainda é parcial e não recebe banda ou configuração unificada inventadas.

O HG8145V5-V2 não estava informando e não recebeu mappings inferidos. Consulte a [matriz de suporte](docs/devices/README.md) e o [ExecPlan do M6](.agent/plans/m6-additional-models.md).

## Estrutura inicial

```text
apps/
  api/                 NestJS
  web/                 Next.js
  worker/              BullMQ
packages/
  contracts/
  auth/
  device-model/
  device-adapters/
  genieacs-client/
  ixc-client/
  persistence/
prisma/
genieacs/
infrastructure/
docs/
```

Resultados e decisões estão nos ExecPlans em [`.agent/plans`](.agent/plans/).
"# telme-acs" 
