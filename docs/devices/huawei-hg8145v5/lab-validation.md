# HG8145V5 15AD.A / V5R020C00S270 — validação controlada

## Ambiente

Validação realizada em 2026-08-12 em um equipamento real fora de laboratório, durante janela autorizada sem usuários dependentes. Somente leituras e mudanças reversíveis de SSID foram executadas. Nenhuma senha, configuração WAN, firmware ou factory reset foi alterado.

## Identidade verificada

| Conceito      | Path                                               |
| ------------- | -------------------------------------------------- |
| Manufacturer  | `InternetGatewayDevice.DeviceInfo.Manufacturer`    |
| Model         | `InternetGatewayDevice.DeviceInfo.ModelName`       |
| Product class | `InternetGatewayDevice.DeviceInfo.ProductClass`    |
| Hardware      | `InternetGatewayDevice.DeviceInfo.HardwareVersion` |
| Software      | `InternetGatewayDevice.DeviceInfo.SoftwareVersion` |

## Wi-Fi verificado

| Banda   | Instância principal                                     | Evidência                                                                   |
| ------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| 2,4 GHz | `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1` | `X_HW_RFBand=2.4GHz`; leitura, escrita temporária e restauração confirmadas |
| 5 GHz   | `InternetGatewayDevice.LANDevice.1.WLANConfiguration.4` | `X_HW_RFBand=5GHz`; leitura, escrita temporária e restauração confirmadas   |

O adapter lê `SSID`, `Enable` e `Status` e só constrói escrita para `SSID`. A validação aceita 1–32 bytes UTF-8 e rejeita caracteres de controle. Os valores anteriores foram mantidos apenas na memória do processo e restaurados após leitura de confirmação.

Estados observados nos dois testes:

```text
queued -> saiu da fila -> valor temporário confirmado
queued restore -> saiu da fila -> valor original confirmado
```

A saída da fila isoladamente não foi tratada como sucesso; a confirmação exigiu leitura do parâmetro.

## WAN verificada

Raiz ativa:

```text
InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1
```

Paths normalizados:

- `ConnectionStatus` para estado conectado/desconectado;
- `ExternalIPAddress` para IPv4, sempre redigido na fixture;
- `Username` para login PPPoE, sempre redigido na fixture.

`X_HW_SERVICELIST=TR069_VOIP_INTERNET` confirmou que a conexão observada atende Internet e TR-069 neste firmware.

## Óptica verificada

Paths reais capturados:

```text
InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower
InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower
```

Os dois parâmetros são inteiros e somente leitura. A interface local do Huawei confirmou `RX=-21 dBm` e `TX=2 dBm`, iguais aos valores TR-069. A grafia `Interafce` é a grafia exposta pelo firmware e não deve ser corrigida no mapping.

## Reboot verificado

Em 2026-08-12 foi enviada uma única tarefa `reboot`, autorizada explicitamente:

```text
05:12:23 — ACS request: Reboot
05:13:35 — Inform: 1 BOOT, M Reboot, 4 VALUE CHANGE
```

O Huawei voltou em aproximadamente 72 segundos. O `UpTime`, atualizado após o retorno, caiu de `102255` para `364`. Nenhuma segunda tarefa de reboot foi enviada.

## Pendente

- descobrir IPv6 e clientes conectados sem inferir paths;
- testar Connection Request separadamente, se necessário.
