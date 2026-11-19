# Huawei HG8145V5-V2 — dossiê de validação

## Estado

Suporte verificado para a combinação exata:

```text
Model: HG8145V5-V2
Hardware: 313D.A
Software: V5R020C00S406
Data model: TR-098
```

Outro hardware ou firmware continua `Unknown/Discover` e usa o adapter genérico seguro.

## Evidência

- Bootstrap e Inform periódicos observados no GenieACS em 2026-10-15 (`00259E-HG8145V5%2DV2-48575443D94850AC`).
- Sessão de `refreshObject: "InternetGatewayDevice"` executada com sucesso via NBI, capturando 3.724 parâmetros leaf.
- Árvore bruta tratada em memória; dados sensíveis devidamente redigidos.
- Fixture criada e testada com parâmetros sanitizados.
- Paths idênticos aos da versão V1 confirmados:
  - Wi-Fi 2.4 GHz: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1`
  - Wi-Fi 5 GHz: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.4`
  - Óptica GPON: `InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig` (RX −21 dBm, TX 2 dBm)
  - WAN PPP: `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1` (IPv4 e IPv6 com `X_HW_IPv6Enable = true`)
- TotalAssociations presente e normalizado (contagem de clientes conectados por rádio).

## Artefatos

```text
packages/device-adapters/src/huawei/hg8145v5-v2/index.ts
packages/device-adapters/test/fixtures/huawei/hg8145v5-v2/313d-a-v5r020c00s406.json
```

## Limitações atuais

- Escrita de senha Wi-Fi permanece `experimental` até alteração e restauração controladas no lab.
- Factory reset e upgrade de firmware permanecem `unknown`.
