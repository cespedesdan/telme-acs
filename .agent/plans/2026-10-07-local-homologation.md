# ExecPlan — Upgrade e acesso de teste local

## Propósito e referência

Executar a parte local do plano fornecido pelo proprietário em `2026-10-07-upgrade-e-acesso-teste.md`: comprovar instalação e segurança, corrigir problemas confirmados e iniciar Web/API/worker para homologação sem depender do IXC.

## Estado inicial

Em 2026-10-07: Node global 24.21.0 e pnpm 11.16.0; instalação offline com lockfile congelado aprovada. PostgreSQL TELME em 5433, Redis, Mongo privado e NBI saudáveis. Outro PostgreSQL ocupa 5432 e não pertence ao projeto. CWMP já estava em execução em 192.168.1.50:7547; não iniciá-lo, pará-lo ou enviar novas tarefas nesta execução. Web e API não estavam escutando em 3000/3101. Não existe checkout Git neste diretório.

## Escopo e componentes

Validar baseline, auditar versões e dependências, corrigir inicialização de homologação e configuração de segurança quando necessário. Componentes: scripts de inicialização, Web Next, worker, documentação e testes. Preservar `.env`, senhas, usuários e volumes. Sem migration de schema planejada.

Fora do escopo automático: publicar domínio/túnel, alterar Cloudflare, criar usuários de outras pessoas, redefinir senhas, executar SSID/reboot/firmware em CPE, iniciar IXC, alterar serviços de outros projetos ou criar Git/branch/commit. Depois do diagnóstico, o proprietário autorizou explicitamente recriar CWMP/FS/UI para corrigir autenticação da infraestrutura, preservando volumes e sem solicitar novas operações físicas.

## Premissas e desconhecidos

- O proprietário confirmou destino futuro em nuvem, sem domínio definido. Preparar instalação convencional em VM Linux/Node/Compose e reverse proxy HTTPS; validar localmente antes. VPS/servidor concreto e implantação externa requerem destino explícito.
- Domínio da Web e pessoas/perfis da equipe aguardam confirmação.
- Não confundir infraestrutura funcionando com aplicações em execução.
- NBI é o único acesso TELME aos dados de GenieACS.
- Integração de persistência usa banco descartável `_test`, distinto do banco operacional.
- Atualização de dependências exige necessidade demonstrada; não usar `audit fix --force` ou troca de major sem análise.

## Marcos e validação

1. Inventário e baseline: install frozen, db:validate, lint, typecheck, test, build, format:check.
2. Audit produção/outdated; consultar documentação oficial para mudanças de runtime/dependências.
3. Corrigir problemas confirmados e acrescentar regressão; validar novamente em sequência, evitando colisão Prisma.
4. Testes HTTP com mocks e PostgreSQL em banco descartável; não chamar mutações NBI reais.
5. Iniciar somente apps necessárias, bind local; verificar health API/Web, Redis/worker, login pelo proxy e navegação de leitura.
6. Registrar resultados e pendências de exposição/equipe/hardware. Não marcar gate externo como aprovado por checks locais.

## Progresso

- [x] Ler referência, regras, estado e versões.
- [x] Confirmar instalação com lockfile congelado offline.
- [x] Baseline completo e auditoria.
- [x] Correções e testes de regressão.
- [x] Integração em banco isolado e startup local.
- [x] Relatório e pendências.

## Descobertas, decisões e resultados

API/Web/worker não estavam executando apesar do Docker ligado. O `start` da Web usa `next start` junto de `output: standalone`, com aviso conhecido da etapa anterior. Investigar entrypoint antes de homologação estável. Preservar CWMP existente sem intervenção e sem assumir que túnel ou hardware estão validados.

Baseline: db:validate e lint passaram; typecheck detectou uma chave extra em `.next/dev/types/routes.d.ts`, arquivo gerado do cache. Pasta `.next/dev` preservada em `.local/cache-backups/next-dev-before-homologation-20261007`; nenhum fonte alterado para esconder o erro. Repetição de typecheck, 64 testes, build e format:check aprovada. Auditoria atual identificou nove alertas (um crítico) em Next, sharp, proxy-addr e source-map-js. Atualizar somente patches corrigidos: Next 16.3.8, sharp 0.35.5, proxy-addr 2.0.8 e source-map-js 1.2.2; manter Node 24, Prisma 7, React 19.2 e demais majors. Versões confirmadas no registro de pacotes e avisos de segurança dos mantenedores.

Instalação final com lockfile congelado aprovada; audit produção sem vulnerabilidades conhecidas. Lint, typecheck, build e format:check aprovados. 72 testes unitários e sete integrações (seis HTTP com mocks e um PostgreSQL) passaram sem skips. Testes adicionais cobrem standalone/assets/loopback/portas, configuração Redis e cookies Secure em produção. Health do worker parado falhou como esperado; com worker ativo, job de sistema e Redis confirmados. Lint passou a ignorar apenas `.local`, `.dependency-repair` e `.pnpm-store` para não analisar cache/backups gerados, mantendo todos os fontes em análise.

Backup privado `.local/backups/telme-acs-before-homologation-20261007.dump` restaurado em banco separado: dois usuários, cinco devices, sete operações e oito auditorias, iguais ao operacional antes/depois. Banco de integração `telme_homologation_20261007_test` separado, com migrations existentes; nenhuma migration de schema nova ou reset do banco operacional. Senhas/contas existentes preservadas.

`pnpm start` iniciou somente API/Web/worker compilados; Web e API confirmadas em loopback 3000/3101. Web HTTP 200, oito assets HTTP 200, readiness PostgreSQL/NBI ok, acesso sem sessão 401, login via proxy 201, cookie HttpOnly, sessão/inventário/detalhe/operações/auditoria 200 e logout 204. Inventário com cinco devices; detalhe de leitura com duas WLANs. Não foi feito E2E visual de navegador nem solicitado refresh/SSID/reboot pela Web.

Descoberta de infraestrutura: CWMP/FS/UI tinham 152 reinícios e erro de autenticação Mongo, com conexão de configuração diferente do NBI saudável. Proprietário autorizou correção explícita. Antes da recriação, fila NBI conferida: oito tarefas, quatro getParameterValues e quatro refreshObject, sem mutações. Recriação limitada aos três serviços usando `.env` atual e sem dependências/volumes removidos. Registrar health final no relatório; recuperação da infraestrutura não valida automaticamente túnel, CPE ou autenticação CWMP.

Preparados `docs/testing/cloud-homologation.md`, unidades systemd e template Nginx HTTPS. São artefatos de instalação, não recursos de nuvem criados. Templates Linux/Nginx ainda precisam de validação no servidor real. Instalar/compilar no Linux; não transferir build/dependências Windows como se fossem homologados no Linux. Web/API/bancos/NBI ficam privados, com Nginx apenas à frente da Web e acesso restrito da equipe. Restam servidor/domínio/certificado/contas individuais, RBAC pela URL externa e gate físico autorizado.

Health final: sete contêineres saudáveis; CWMP/FS/UI com zero reinícios depois da recriação autorizada. Os dois bancos descartáveis criados nesta execução foram removidos; backup privado e banco operacional preservados. Relatório em `docs/testing/2026-10-07-homologation-results.md`. Não houve configuração de `cwmp.auth` nem validação do túnel; confirmar autenticação antes de exposição pública de modems. Fonte anterior em ZIP preservada; pacote atualizado de fontes será fornecido, sem `.env`, banco ou dependências.
