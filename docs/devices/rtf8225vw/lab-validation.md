# RTF8225VW — validação controlada

## Ambiente

Leituras realizadas em 2026-08-13 via GenieACS NBI contra equipamentos reais. A atualização completa solicitada ficou `queued` para o próximo Inform. Nenhum SSID, senha, WAN ou estado do equipamento foi alterado.

## Identidade

O matching exige exatamente modelo/product class, hardware e firmware. A revisão REV4 é um adapter distinto e parcial; caminhos da REV3 não são reutilizados nela.

## Wi-Fi REV3

| Banda   | Instância principal                                     | Evidência capturada                 |
| ------- | ------------------------------------------------------- | ----------------------------------- |
| 2,4 GHz | `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1` | `Standard=acng`, `Enable`, `Status` |
| 5 GHz   | `InternetGatewayDevice.LANDevice.1.WLANConfiguration.5` | `Standard=ax`, `Enable`, `Status`   |

O adapter lê `SSID`, `Enable` e `Status`. O SSID real nunca entra na fixture. A construção do write está testada, mas a capability permanece `experimental` até mudança temporária, leitura de confirmação e restauração no hardware.

## WAN REV3

Raiz observada:

```text
InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1
```

`ConnectionStatus`, `ExternalIPAddress` e `Username` foram capturados. IPv4 e PPPoE são redigidos na fixture. Na REV4, somente `ExternalIPAddress` estava presente, portanto o estado WAN e PPPoE continuam `unknown`.

## Pendências

- receber a árvore completa da REV4 após novo Inform;
- validar escrita/restauração de SSID na REV3 em janela autorizada;
- validar reboot na REV3;
- descobrir óptica e clientes sem inferir paths;
- manter revisões/firmwares diferentes no fallback genérico.
