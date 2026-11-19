# ADR-0003: Persistência local e RBAC sem dependência do IXC

## Status

Accepted

## Context

O núcleo do TELME ACS precisa cadastrar e operar CPEs antes da integração com o IXC. Usuários, identidade técnica dos devices, capabilities, operações e auditoria pertencem ao TELME ACS e não podem depender da disponibilidade ou do modelo comercial de um sistema externo.

O acesso é sensível: Support L1 não deve receber operações de firmware, factory reset, WAN ou lote. Ao mesmo tempo, persistir cada permission em tabelas exigiria seed e sincronização antes de existir uma necessidade real de roles customizadas.

## Decision

- PostgreSQL é a fonte de verdade dos dados do TELME ACS; o Prisma é acessado por `@telme/persistence` usando o driver PostgreSQL exigido pelo Prisma 7.
- `Device` exige somente identidade técnica local. Não há campo obrigatório nem chave estrangeira do IXC.
- Sistemas futuros usam `ExternalIdentifier`; `DeviceBinding` registra método, início, término e autor sem substituir a identidade do device.
- Roles são persistidas no usuário e permissions são versionadas em `@telme/auth`.
- Verificações negam por padrão para usuário inativo, role desconhecida ou permission ausente.
- `READ_ONLY` é a role padrão no banco.
- Operações perigosas exigem permission específica; confirmação explícita continua obrigatória na futura camada de aplicação.
- Operações, auditorias e vínculos restringem exclusões que apagariam histórico. A remoção de usuário preserva registros e torna o ator nullable.
- Audit summaries podem conter apenas dados seguros; senhas e tokens devem ser gravados como `[REDACTED]`.

## Consequences

- O ACS funciona integralmente sem o IXC; a integração M7 apenas enriquece o device com relações opcionais.
- Alterar a matriz de acesso exige revisão de código e testes, mas não migration ou seed.
- Roles personalizadas por cliente não são suportadas no M3; quando houver requisito real, a matriz poderá migrar para tabelas mantendo os mesmos nomes de permissions.
- Email deve ser normalizado para minúsculas pela futura autenticação antes de ser persistido.
