# ExecPlan — M4: Primeiro HGU validado

## Status

Concluído em 2026-08-12 para a combinação exata de hardware e firmware documentada abaixo.

## Propósito

Transformar uma captura real do Huawei HG8145V5 em fixture sanitizada, adapter testado e validação controlada, sem inferir paths e sem depender do IXC.

## Escopo verificado

```text
Model: HG8145V5
Hardware: 15AD.A
Software: V5R020C00S270
```

Outro hardware/firmware permanece no adapter genérico. Factory reset e firmware rollout estão fora deste plano.

## Marcos

1. Receber Inform e identificar hardware/firmware.
2. Atualizar a árvore uma vez e inventariar paths sem valores.
3. Criar fixture mínima sanitizada.
4. Implementar matching, normalização e transforms verificados.
5. Validar Wi-Fi read/write com restauração.
6. Validar reboot e operação.
7. Atualizar documentação e checks.

## Descobertas

- O HGU registrou eventos `BOOTSTRAP`, `BOOT`, `VALUE CHANGE` e `PERIODIC`.
- A captura completa expôs 3.398 parâmetros TR-098.
- Wi-Fi 2,4 GHz principal usa `WLANConfiguration.1`; 5 GHz principal usa `WLANConfiguration.4`.
- A WAN ativa usa `WANConnectionDevice.2.WANPPPConnection.1`.
- Os paths ópticos usam a grafia vendor `X_GponInterafceConfig`.
- Alguns campos WPS e timestamps de diagnóstico retornaram XML inválido; foram excluídos.
- O equipamento não é de laboratório. A autorização cobriu apenas mudança reversível de SSID; reboot exige confirmação separada.

## Decisões

- Matching exige modelo, hardware e software exatos.
- SSID é validado em 1–32 bytes UTF-8 e caracteres de controle são rejeitados.
- A saída de um task da fila não comprova execução; Wi-Fi só foi aprovado após leitura do valor e da restauração.
- Resposta NBI bruta nunca foi persistida.
- RX/TX foi promovido para `read-only` após os valores serem comparados com a interface local do equipamento.
- Reboot só foi aprovado após tarefa sair da fila, evento `1 BOOT,M Reboot` e reinício do uptime.

## Progresso

- [x] Receber o primeiro Inform do HG8145V5.
- [x] Capturar e inventariar a árvore real.
- [x] Gerar fixture sanitizada revisada.
- [x] Implementar adapter com matching exato.
- [x] Validar leitura e escrita/restauração do SSID 2,4 GHz.
- [x] Validar leitura e escrita/restauração do SSID 5 GHz.
- [x] Normalizar WAN e identidade.
- [x] Confirmar unidade RX/TX na interface local.
- [x] Validar reboot e retorno do Inform.
- [x] Executar checks completos do workspace.

## Validação observada

- `pnpm --filter @telme/device-adapters typecheck`: passou.
- `pnpm --filter @telme/device-adapters test`: 14 testes passaram.
- `pnpm format:check`: passou.
- `pnpm lint`: passou após substituir a regex de controle por comparação de code points.
- `pnpm typecheck`: passou nos workspaces aplicáveis.
- `pnpm test`: passou; 37 testes no total, incluindo os 14 do adapter.
- `pnpm build`: passou, incluindo Prisma e Next.js.
- Teste real SSID 2,4 GHz: escrita, leitura e restauração confirmadas.
- Teste real SSID 5 GHz: escrita, leitura e restauração confirmadas.
- Óptica: RX −21 dBm e TX 2 dBm confirmados na interface local.
- Reboot: `Reboot` às 05:12:23, `BOOT/M Reboot` às 05:13:35 e uptime reduzido de 102255 para 364.

## Trabalho restante

O M4 não tem trabalho obrigatório pendente para esta revisão. IPv6, clientes conectados, Connection Request, factory reset e firmware permanecem fora do suporte validado e deverão seguir o mesmo workflow de captura antes de serem promovidos.
