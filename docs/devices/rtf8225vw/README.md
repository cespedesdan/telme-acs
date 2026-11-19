# Askey RTF8225VW — dossiê de validação

## Estado

Suporte de leitura verificado para a combinação exata:

```text
Model: RTF8225VW
Hardware: REV3
Software: BR_SG_g1.4_RTF_TEF004_V2.9
Data model: TR-098
```

Uma segunda revisão observada como `RTF8225VW-SV / REV4 / CO_g1.13_RTF_TEF004_V2.39` possui identidade, firmware, IPv4 e três instâncias WLAN parciais; a banda ainda não foi informada pelo equipamento.

## Evidência

- Respostas NBI reais observadas em 2026-08-13; nenhum acesso ao MongoDB.
- REV3 com 3.244 parâmetros inventariados; fixture mínima com serial, seis SSIDs, IPv4 e PPPoE redigidos.
- REV4 com árvore parcial; fixture mínima separada para não misturar firmwares.
- REV3: WAN conectada, IPv4, PPPoE e todas as seis instâncias WLAN lidas pelo adapter real.
- REV3: endereço IPv6 global confirmado e normalizado em 2026-08-18.
- `X_TELEFONICA_COM_Roaming.UniqueSSID` foi capturado como ativo na REV3.
- `TotalAssociations` confirmou duas conexões na WLAN 5; a lista `Hosts` ainda não entregou nomes ou MACs.
- O caminho gravável de senha foi confirmado sem exibir ou armazenar o valor; nenhuma senha foi alterada.

## Estado das ações

Os transforms de SSID e senha REV3 usam somente as instâncias capturadas, mas as escritas e o reboot permanecem `experimental`. A API não permite essas ações enquanto alteração reversível, restauração e reboot ainda não forem confirmados no equipamento controlado.

Veja [lab-validation.md](lab-validation.md) para os paths, evidências e limitações.

## Artefatos

```text
packages/device-adapters/src/rtf8225vw/index.ts
packages/device-adapters/test/fixtures/rtf8225vw/rev3-v2-9.json
packages/device-adapters/test/fixtures/rtf8225vw/sv-rev4-v2-39.json
```
