# ExecPlan — M6: estabilização antes do IXC

## Propósito

Corrigir os problemas da revisão de 2026-10-04, preservar a gestão independente do IXC e deixar testes locais repetíveis. Pesquisa de melhorias delegada ao agente `acs_research`, autorizada pelo proprietário.

## Estado inicial e escopo

Node 24.21.0; 48 testes unitários e três testes HTTP passaram. Contêineres parados. Next 16.3.0 e dependências transitivas possuem alertas. Operações são gravadas depois do envio; filas não são reconciliadas. Consultas sincronizam toda a frota e limitam o dashboard a 50 resultados. M6 tem suporte parcial documentado.

Corrigir dependências, auditoria pré-envio, idempotência, reconciliação read-only, paginação/totais, sessões, readiness, limitação de login e configuração local. Acrescentar testes sobre serviços reais com transportes simulados, banco descartável e roteiro de homologação. Rotacionar somente os segredos locais de exemplo com preservação dos volumes. Não promover capabilities sem evidência, nem executar escritas/reboot em CPEs durante esta implementação.

## Componentes

API, Web, client GenieACS, contratos, Prisma/migrations, configuração local, testes e documentação. Reutilizar Nest/Prisma e recursos nativos; não adicionar framework de testes ou serviço novo.

## Decisões

- Persistir intenção e auditoria antes do envio; requisições incertas nunca são reenviadas automaticamente.
- Task ausente não prova execução: confirmar pelo readback atualizado ou evidência de reboot; falhas/expiração permanecem explícitas.
- Banco de teste separado; jamais definir TEST_DATABASE_URL com a URL do banco operacional.
- MAC/hosts e funções de hardware ainda não capturados permanecem desconhecidos.
- Sem nova branch, coautoria, commit, deploy automático ou inicialização de Git nesta tarefa.

## Progresso

- [x] Ler instruções e revisar fluxo atual.
- [x] Delegar pesquisa ACS.
- [x] Corrigir dependências/configuração.
- [x] Implementar estabilidade API/Web e migration aditiva.
- [x] Testar código, integração simulada e banco descartável.
- [x] Verificar leituras locais e documentação.

## Validação

Executar lint, typecheck, testes, integração, build, format:check, db:validate e audit de produção. Verificar que falha de banco impede envio, repetição da mesma chave não duplica tasks, fila ausente sem readback não vira aplicada, falhas de sessão/inventário não são confundidas e totais não dependem da paginação. Registrar resultados e limitações abaixo.

## Descobertas e resultados

Validação em 2026-10-05: `pnpm test` passou com 64 testes unitários; `pnpm test:integration` passou com seis testes HTTP e um teste PostgreSQL, sem skips e com NBI simulado. Typecheck, lint, build, format:check e db:validate aprovados. `pnpm audit --prod` retornou zero alertas (antes: 20). Next atualizado para 16.3.6 e overrides transitivos fixados no lockfile; não foi usado audit fix force.

Interrupção deixou AuthService, teste de persistência e pacote Next preenchidos com zeros. AuthService foi recuperado do conteúdo registrado; teste restaurado do patch original e reforçado com guarda de banco `_test`; Next restaurado de tarball oficial com SHA-512 correspondente ao lockfile. Varredura de fontes confirmou somente esses dois arquivos de código afetados. Instalação foi concluída. Durante checks simultâneos houve uma colisão EEXIST de geração Prisma; executar as suítes sequencialmente.

PostgreSQL externo já ocupava 5432: mantido intacto. TELME agora usa 5433 e API bind 127.0.0.1 na configuração local ignorada. Segredos locais Mongo/UI iguais aos exemplos foram rotacionados; volumes preservados e Mongo/NBI saudáveis. Nenhuma senha de operador ou de HGU foi alterada.

Migration aditiva aplicada primeiro em `telme_stabilization_test`, depois no banco operacional, sem apagar registros. Backup em `.local/backups/telme-acs-before-20261005.dump` (ignorado pelo Git) restaurado em `telme_restore_test`; contagens iguais: cinco dispositivos, dois usuários, seis operações e seis auditorias antes/depois. Bancos descartáveis removidos após validação; backup e banco operacional preservados.

Web local e seus sete scripts retornaram HTTP 200; login pelo proxy HTTP 201; readiness PostgreSQL/NBI ok; inventário com cinco dispositivos e sync current; leitura de detalhe, duas redes Wi-Fi e histórico validada. Web 3000, API 3101 e PostgreSQL 5433 somente loopback. Mongo/Redis/NBI executando; CWMP, FS e GenieACS UI mantidos parados. Nenhuma tarefa nova foi enviada a um HGU nesta implementação. Não foi executado E2E visual com navegador; fluxo HTTP e build foram verificados. Preview local usa `next start`; a configuração standalone emite aviso e precisa de empacotamento/entrypoint específico para deploy de produção, que não faz parte desta tarefa.

Documentação em `docs/testing/pre-ixc-validation.md`, pesquisa delegada em `docs/architecture/acs-improvements-research.md` e decisão em ADR-0005. Sem branch, commit, push ou deploy de produção.

Hardware físico e conclusão integral do M6 ainda exigem capturas e janela controlada. Capabilities experimentais e paths desconhecidos permanecem bloqueados. Próximo gate: SSID reversível com restauração/readback, reboot autorizado e fila/retorno do CPE; completar revisões/hosts pendentes antes de M7. IXC permanece opcional. Melhorias seguintes: frescor por seção, clientes por SSID onde verificados e histórico/alertas configuráveis. A implementação atual é de API única; locks/limitação compartilhados são necessários antes de múltiplas réplicas.
