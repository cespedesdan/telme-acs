# Homologação local e preparo para nuvem — 2026-10-07

## Resultado

Parte local executada e validada. Web/API/worker em execução; sete serviços Docker saudáveis. Preparação convencional de VM Linux entregue, mas **não houve implantação em nuvem, publicação de domínio nem validação externa/visual ou homologação física de HGU nesta execução**. IXC permanece opcional e não integrado.

## Correções

- Next 16.3.6 → 16.3.8; sharp 0.35.4 → 0.35.5; proxy-addr 2.0.8 e source-map-js 1.2.2 fixados no lockfile. Sem atualização forçada de major, Node global permanece 24.21.0 e pnpm 11.16.0.
- Startup standalone correto, tracing do monorepo explícito e static/public preparados no build. Bind Web padrão 127.0.0.1, configurável via WEB_HOST/WEB_PORT com validação. `pnpm start` inicia os três builds no host, sem bootstrap/migrations/Docker implícitos.
- Worker e health compartilham leitura de `.env`/REDIS_URL. Health agora exige consumo de job de sistema e não apenas PING Redis; não gera operações físicas.
- Testes adicionais de assets, configuração, bind privado, portas inválidas e cookies seguros em produção.
- Cache Next gerado e corrompido preservado fora do uso; regras de lint excluem pastas locais de cache/backup/dependências, não fontes do projeto.
- CWMP/FS/UI tinham conexão Mongo antiga e erro de autenticação, com 152 reinícios. Correção de infraestrutura autorizada explicitamente: fila NBI conferida com oito tarefas somente de leitura; recriados apenas os três serviços com a configuração atual e volumes preservados. Health final aprovado, zero reinícios após recriação. NBI/bancos não foram recriados.

Referências de segurança consultadas: [Next](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4), [proxy-addr](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h), [sharp](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w). Versões corrigidas conferidas no registro npm e relatório de audit; nove alertas iniciais → zero alertas conhecidos de produção. Isso não equivale a uma auditoria completa de segurança do produto ou dos contêineres.

## Verificações executadas

| Verificação                                    | Resultado                                         |
| ---------------------------------------------- | ------------------------------------------------- |
| Install com lockfile congelado                 | Aprovado                                          |
| Prisma schema                                  | Válido                                            |
| Lint / typecheck / build / format:check        | Aprovados                                         |
| Testes unitários                               | 72 aprovados                                      |
| Integração HTTP com mocks + PostgreSQL isolado | 6 + 1 aprovados, sem skips                        |
| Audit produção                                 | Sem vulnerabilidades conhecidas                   |
| Web / oito assets de JS/CSS                    | HTTP 200                                          |
| Readiness API, pelo proxy Web                  | Banco e GenieACS ok                               |
| Inventário sem sessão                          | HTTP 401                                          |
| Login / sessão / logout                        | HTTP 201 / 200 / 204                              |
| Inventário / detalhe / operações / auditoria   | HTTP 200                                          |
| Worker parado                                  | Health falhou como esperado                       |
| Worker ativo                                   | Redis e job health aprovados                      |
| Infraestrutura Docker                          | 7 serviços saudáveis                              |
| Instalação/units/Nginx em Linux                | Templates entregues; não executados neste Windows |

Fluxo funcional confirmado via HTTP, não por E2E visual. Inventário com cinco dispositivos; detalhe inspecionado apenas por leitura, com duas redes Wi-Fi. Não foram solicitados SSID, senha, reboot ou firmware. Nenhuma capability experimental foi promovida.

## Dados e recuperação

Snapshot operacional: dois usuários, cinco dispositivos, sete operações e oito auditorias, contagens preservadas antes/depois. Backup `.local/backups/telme-acs-before-homologation-20261007.dump` restaurado em banco separado com contagens iguais. Bases `telme_homologation_20261007_test` e `telme_homologation_restore_20261007_test` criadas exclusivamente para esta execução e removidas após os testes. Banco e backup operacional preservados, sem nova migration ou redefinição de senha.

`.env`, backups, dependências, capturas privadas e builds locais não pertencem ao pacote de fontes. Nenhum Git/branch/commit/coautoria criado.

## Próximo gate

1. Escolher VM e domínio Web; configurar HTTPS e VPN/allowlist para a equipe.
2. Instalar dependências e compilar no Linux, com segredos novos e banco de homologação — não reutilizar build Windows.
3. Validar templates systemd/Nginx no host, login por HTTPS, RBAC dos usuários individuais e ausência de exposição de API/bancos/NBI.
4. Confirmar autenticação CWMP no GenieACS antes de publicar o endpoint dos modems. Recuperação da conexão interna ao Mongo não configura automaticamente `cwmp.auth`.
5. Escolher HGU de laboratório e janela de teste; validar Inform completo, leituras e, mediante autorização específica, SSID reversível/readback/restauração e reboot.
6. Somente após estabilidade e revisões pendentes do M6, iniciar IXC com menor privilégio e contratos confirmados.

Roteiro de instalação: [homologação convencional em nuvem](cloud-homologation.md). ExecPlan: [preparação e resultados](../../.agent/plans/2026-10-07-local-homologation.md).
