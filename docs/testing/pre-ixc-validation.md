# Estabilização e testes antes do IXC

## Escopo

O ACS continua independente do IXC. Esta etapa melhora operações, segurança local e inventário; não homologa automaticamente novas revisões de HGU.

## Comportamento das operações

- Enviar `Idempotency-Key` com UUID em SSID, senha, refresh e reboot. Repetir a mesma chave e conteúdo recupera a operação; trocar conteúdo com a mesma chave retorna 409.
- Intenção e auditoria são persistidas antes do envio ao NBI. Falha de banco impede o comando.
- Timeout ou resposta perdida fica `queued`/`DISPATCH_UNCERTAIN`; não há reenvio automático. Consultar o histórico antes de fazer outra solicitação.
- Reconciliação no processo API a cada 15 segundos consulta tarefas, faults e evidências pelo NBI. História não depende de uma resposta lenta do ACS.
- SSID exige uma tarefa de leitura posterior e valor atualizado correspondente. O cache criado pelo próprio SetParameterValues não confirma aplicação.
- Reboot exige evento BOOT posterior. Isso comprova reinício observado, não causalidade exclusiva.
- Refresh exige timestamps posteriores nas folhas solicitadas. Senhas ilegíveis não possuem confirmação automática e capabilities experimentais continuam bloqueadas.
- O prazo padrão é 24 horas, configurável por `OPERATION_TTL_SECONDS` entre 60 e 604800. Expiração só é registrada após remover a tarefa conhecida no NBI. Se o NBI estiver indisponível, manter pendente e verificar depois.
- Operações antigas sem contrato de confirmação não são promovidas automaticamente para aplicadas. Revisão manual necessária.
- Uma leitura posterior com resposta perdida não é repetida automaticamente; aguarda evidência/prazo para evitar duplicação. Não assumir que expirado significa rollback de uma configuração já enviada.

## Inventário e sessão

`GET /api/v1/devices/inventory?q=&page=1&state=all` entrega 50 itens por página, total filtrado e métricas globais. Busca por identificação local, serial, modelo e PPPoE/MAC quando existentes; MAC não capturado não é inventado.

Sincronização do inventário compartilhada por processo e limitada a uma tentativa por minuto. Contato online/atrasado/offline é calculado com janelas explícitas (`DEVICE_ONLINE_WINDOW_SECONDS`, `DEVICE_OFFLINE_WINDOW_SECONDS`), não comprova conectividade em tempo real. Estes limites devem ser ajustados ao Inform esperado. Identificação manual é auditada com permissão `device.bind`.

API/ACS indisponíveis exibem erro de conexão, sem invalidar uma sessão válida. HTTP 401 limpa os dados da sessão. `/api/v1/health` é liveness; `/api/v1/health/ready` verifica PostgreSQL e NBI separadamente e retorna 503 quando degradado. Redis/worker não estão inclusos nesse readiness.

Login limitado a 30 tentativas por origem e conta em cinco minutos, em memória, para uma única API. Antes de múltiplas réplicas, mover limite e locks para Redis e definir a política de proxy confiável.

## Iniciar no Windows

Não sobrescrever `.env` existente. Configurar segredos próprios antes do primeiro uso. Docker inicia infraestrutura, não inicia Web/API/worker.

```powershell
pnpm.cmd install --frozen-lockfile
docker compose up -d --wait
pnpm.cmd db:migrate:deploy
pnpm.cmd admin:create
pnpm.cmd dev
```

`admin:create` é necessário só para criar um operador inexistente, não para cada inicialização. Web: http://127.0.0.1:3000. API interna: http://127.0.0.1:3101. Se a porta 5432 estiver ocupada por outro PostgreSQL, usar 5433 em `POSTGRES_PORT` e `DATABASE_URL`, sem encerrar o outro serviço. Neste ambiente local foi necessário esse ajuste.

Para testes sem contato físico, iniciar somente `postgres redis mongo genieacs-nbi`; manter `genieacs-cwmp` parado. Iniciar CWMP pode fazer o CPE executar tarefas já pendentes: verificar fila e janela antes disso.

## Testes automatizados

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
pnpm.cmd format:check
pnpm.cmd db:validate
pnpm.cmd audit --prod
```

Integrações de banco exigem banco separado com nome terminado em `_test`. **Nunca usar a URL operacional em `TEST_DATABASE_URL`: os testes de persistência apagam tabelas do banco escolhido.** Criar banco descartável, aplicar migrations nele e definir `TEST_DATABASE_URL` apenas no terminal do teste. A suíte HTTP usa os serviços reais de autenticação, inventário e operação com NBI simulado; CI não contata CPE ou IXC.

## Gate físico antes do M7

1. Backup do PostgreSQL e ensaio de restauração em outro banco.
2. Confirmar modelo, hardware e firmware exatos na matriz de suporte.
3. Em HGU controlado, guardar SSID anterior; solicitar alteração reversível, observar fila, readback e auditoria; restaurar e confirmar novamente.
4. Reboot somente autorizado; acompanhar BOOT e novo Inform. Testar CPE desconectado: fila, retorno e expiração.
5. Validar acesso READ_ONLY, NOC e suporte; falha de banco/NBI e reinício da API não podem duplicar comandos.
6. Completar capturas sanitizadas pendentes de HG8145V5-V2 e revisões adicionais, hosts/nomes, senha e demais escritas ainda experimentais.
7. Só depois iniciar M7 com credencial IXC de menor privilégio, contratos reais confirmados, mocks, correspondência ambígua para revisão e vínculo opcional.

Veja a [pesquisa de melhorias ACS](../architecture/acs-improvements-research.md). Próximas entregas úteis: data de coleta por seção, clientes por SSID onde capturados, histórico de óptica/WAN e alertas com limites configuráveis. Firmware e operações em massa ficam para homologação própria.
