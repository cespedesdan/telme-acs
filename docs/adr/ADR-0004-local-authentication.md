# ADR-0004: Autenticação local do Web MVP

## Status

Accepted

## Context

O M5 precisa autenticar operadores e aplicar o RBAC do TELME ACS sem depender do IXC. O acesso é privilegiado, a revogação de usuários deve surtir efeito imediatamente e credenciais não podem ser expostas ao JavaScript do navegador.

## Decision

- Persistir somente hashes de senha com `scrypt`, salt aleatório e comparação constante usando a biblioteca padrão do Node.js.
- Entregar uma sessão assinada por HMAC SHA-256 em cookie `HttpOnly`, `SameSite=Strict`, com oito horas de validade e `Secure` em produção.
- Consultar usuário, role e estado ativo no PostgreSQL a cada request autenticada; o token carrega somente ID e expiração.
- Criar o primeiro administrador apenas por comando explícito e variáveis de ambiente.
- Manter permissões versionadas em `@telme/auth` e negar por padrão.

## Consequences

A implementação não adiciona uma dependência de autenticação e funciona sem IXC. Desativar um usuário revoga o próximo request, mas cada request autenticada exige uma leitura no PostgreSQL. Recuperação de senha, MFA e SSO permanecem fora do M5 e devem ser avaliados antes de exposição fora da rede administrativa controlada.
