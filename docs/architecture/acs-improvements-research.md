# Melhorias ACS — pesquisa para estabilização antes do IXC

Pesquisa em 2026-10-04. Fontes primárias: documentação e código oficial GenieACS, Broadband Forum e documentação da plataforma Axiros. Prioridades e esforços são avaliação para o TELME ACS, não promessas dos fornecedores. Não houve contato com HGUs nem envio de tarefas.

## Prioridades

| Prioridade | Melhoria                          | Entrega útil                                                                                              | Esforço estimado      | Pré-requisito                                                      |
| ---------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------ |
| P0         | Operações com evidências e faults | Fila, falha, prazo e confirmação verificáveis; motivo seguro no histórico                                 | Médio                 | NBI, persistência e testes simulados                               |
| P0         | Segurança e recuperação           | Dependências corrigidas, segredos próprios, interfaces internas restritas e restauração de backup testada | Médio                 | Ambiente local; TLS/autenticação CWMP exige piloto por firmware    |
| P1         | Frescor e estado de contato       | Data de coleta por seção; contato atrasado em relação ao Inform esperado                                  | Pequeno/médio         | Metadados NBI; intervalo capturado ou configuração explícita       |
| P1         | Inventário sustentável            | Paginação, totais globais, projeção NBI e sincronização independente da navegação                         | Médio                 | NBI e PostgreSQL                                                   |
| P1         | Histórico e alertas básicos       | Óptica/WAN/clientes ao longo do tempo; deduplicação, recuperação e limiares configuráveis                 | Médio                 | Apenas métricas já verificadas                                     |
| P1         | Clientes por rede Wi-Fi           | SSID/banda, contagem, nome quando fornecido e sinal/taxas quando disponíveis                              | Médio por revisão     | Captura sanitizada de hosts/associações e relação entre instâncias |
| P2         | Perfis de provisionamento         | Perfis versionados por adapter/revisão; prévia, piloto e rollback planejado                               | Médio/alto            | Escritas reversíveis homologadas                                   |
| P2         | Diagnósticos pelo próprio CPE     | Ping/DNS/traceroute, posteriormente teste de velocidade e vizinhança Wi-Fi                                | Médio por diagnóstico | Paths capturados, servidor de teste e limites operacionais         |
| P3         | USP/TR-369                        | Avaliar telemetria/eventos em novos equipamentos compatíveis                                              | Alto                  | Agente USP comprovado e controller; não é pré-requisito IXC        |

## Operações: o que as fontes realmente comprovam

O NBI documenta HTTP 200 para tarefa executada e 202 para tarefa enfileirada. Permite consultar tarefas, repetir tarefas com falha e excluir tarefas. Excluir da fila também pode resultar de cancelamento ou expiração; ausência isolada não demonstra aplicação. Usar resultado do ACS, faults e evidência posterior adequada a cada ação. [API oficial GenieACS](https://docs.genieacs.com/en/stable/api-reference.html).

A fonte v1.2.16 confirma fault de tarefa com `_id = deviceId + ':task_' + taskId`, além de `device`, `channel`, `timestamp`, `code`, `message`, `detail`, `retries` e campos opcionais. Consultar pelo NBI com ID exato evita confundir faults de presets com a operação do usuário. Guardar mensagem sanitizada; detalhes podem conter parâmetros ou dados sensíveis. [Persistência oficial de faults](https://github.com/genieacs/genieacs/blob/v1.2.16/lib/cwmp/db.ts#L517-L559).

Na submissão, `expiry` numérico significa segundos relativos ao timestamp; string ISO representa data absoluta. Um epoch em milissegundos como número tem significado errado. Timeout HTTP do pedido, prazo da tarefa no GenieACS e prazo operacional TELME são diferentes. Não presumir que expirar o registro TELME cancelou a tarefa upstream. [Normalização oficial de tarefas](https://github.com/genieacs/genieacs/blob/v1.2.16/lib/api-functions.ts#L240-L246).

**Limitação importante do readback:** em `SetParameterValuesResponse`, GenieACS atualiza o cache com o próprio valor enviado e timestamp novo. Consultar `/devices` e comparar esse cache não prova leitura independente do CPE. Para homologar escrita, solicitar leitura posterior dos parâmetros pertinentes e confirmar a evidência; segredos ilegíveis precisam de validação controlada separada. `Reboot` no cache registra resposta ao comando, enquanto `_lastBoot` representa o evento BOOT recebido. Um BOOT posterior comprova reinício observado, mas não sua causa exclusiva. [Tratamento oficial das respostas](https://github.com/genieacs/genieacs/blob/v1.2.16/lib/session.ts#L2531-L2606).

## Frescor, coleta e segurança

Provisions usam `declare()` com timestamps para decidir se reutilizam cache ou buscam o CPE. Objetos dinâmicos precisam de atualização de instâncias, além de valores. Scripts podem executar várias vezes na sessão: efeitos externos exigem idempotência. Isso sustenta coleta seletiva em Inform, preservando a navegação como leitura do inventário. Exibir “coletado em” permite ao suporte distinguir valor antigo de estado atual. [Provisions oficiais](https://docs.genieacs.com/en/stable/provisions.html).

`_lastInform` e `_lastBoot` vêm dos eventos respectivos; timestamps de folhas representam atualização de valores, enquanto timestamps de objetos podem representar descoberta de estrutura. Portanto, um Inform recente não atualiza automaticamente toda a seção Wi-Fi/óptica. [Metadados oficiais do dispositivo](https://github.com/genieacs/genieacs/blob/v1.2.16/lib/cwmp/db.ts#L100-L120).

GenieACS aceita conexões CWMP por padrão; configurar `cwmp.auth` permite autenticação, inclusive com consulta de credenciais por extensão. Recomenda-se credencial própria por equipamento e piloto antes de exigir autenticação para a frota. Validar certificados/TLS nos firmwares reais e manter NBI/bancos internos. [Autenticação oficial](https://docs.genieacs.com/en/stable/cpe-authentication.html). Há configuração nativa de interfaces, certificados e logs JSON para os serviços. [Variáveis oficiais](https://docs.genieacs.com/en/stable/environment-variables.html).

## Wi-Fi e diagnósticos: útil, mas dependente do HGU

Plataformas comerciais expõem configuração por banda, clientes por SSID, RSSI, taxas e erros por cliente; são melhorias úteis para suporte. Para o TELME, começar pela contagem disponível e evoluir com capturas verificadas. Host DHCP pode permanecer após desconexão e não equivale a associação Wi-Fi ativa; nome ausente deve aparecer como não informado. MAC identifica uma observação, mas pode ser aleatório; não prometer fabricante ou nome de pessoa a partir dele. [Recursos de monitoramento Axiros](https://www.axiros.com/blog/2024/11/07/axwifi-excellence-optimizing-signal-quality-and-resolving-wi-fi-challenges-for-seamless-connectivity).

Ping, DNS e testes TR-143 são exemplos de diagnósticos presentes em plataformas ACS. Fazer teste no CPE diferencia o caminho do assinante do caminho do servidor ACS. Testes de velocidade consomem banda e precisam de limites e endpoints apropriados; scan Wi-Fi exige verificar impacto no rádio. [Diagnósticos Axiros](https://www.axiros.com/products/ax-mobility-software-development-kit). O catálogo Broadband Forum documenta modelos e diagnósticos padronizados; não comprova implementação em um Huawei/Askey/MitraStar particular. [Modelos CWMP oficiais](https://cwmp-data-models.broadband-forum.org/).

USP suporta gestão e telemetria com transports como MQTT/WebSocket e modelo Device:2. É evolução futura para equipamentos comprovadamente compatíveis, não uma migração necessária para estabilizar a frota TR-069 existente. [USP oficial](https://usp.technology/).

## Evidência local e próximos passos

Nos dossiês atuais: HG8145V5 15AD.A/S270 possui SSID e reboot homologados, senha experimental e clientes pendentes; RTF8225VW REV3 tem seis SSIDs, UNIQUE_SSID e contagem, mas nomes/ações ainda pendentes; GPT2742 tem três WLANs, UNIQUE_SSID e contagens, mas hosts/óptica/PPPoE/escritas/reboot incompletos; HG8145V5-V2 aguarda descoberta. Consultar `docs/devices/` antes de prometer uma função por nome comercial.

Antes do IXC, aprovar testes locais reproduzíveis: operação auditada antes do envio; fila preservada ao reiniciar; fault corretamente associado; desaparecimento de tarefa sem evidência não vira aplicado; timeout de envio não gera reenvio cego; leitura antiga não confirma atualização; RBAC bloqueia escrita; API/GenieACS indisponíveis não apagam sessão válida; banco restaura a partir de backup. Depois executar escrita reversível e restauração em HGU controlado, com captura/readback registrados.

Após esse gate, o IXC pode enriquecer o inventário por leitura e vínculo opcional, preservando gestão dos CPEs durante indisponibilidade da integração. Métricas detalhadas, autoprovisionamento em massa e firmware devem avançar em etapas próprias após a homologação.
