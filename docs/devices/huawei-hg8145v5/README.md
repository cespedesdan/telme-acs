# Huawei HG8145V5 — dossiê de validação

## Estado

Suporte parcial verificado para a combinação exata:

```text
Model: HG8145V5
Hardware: 15AD.A
Software: V5R020C00S270
Data model: TR-098
```

Outro hardware ou firmware continua `Unknown/Discover` e usa o adapter genérico.

## Evidência

- Primeiro Inform e eventos periódicos observados no GenieACS em 2026-08-12.
- Árvore completa atualizada uma vez via NBI, com 3.398 parâmetros inventariados.
- Resposta NBI bruta permaneceu apenas em memória.
- Fixture revisada com serial, SSIDs, IPv4 e usuário PPPoE redigidos.
- SSID 2,4 GHz alterado temporariamente, lido de volta e restaurado.
- SSID 5 GHz alterado temporariamente, lido de volta e restaurado.
- O caminho gravável de senha Wi-Fi foi confirmado em 2026-08-18 sem exibir ou armazenar seu valor; nenhuma senha foi alterada.
- IPv6 habilitado e endereço global foram confirmados e normalizados com valores reais sempre redigidos nas fixtures.
- RX −21 dBm e TX 2 dBm comparados e confirmados na interface local.
- Reboot remoto executado e confirmado por `M Reboot`, `BOOT` e reinício do uptime.

Veja [lab-validation.md](lab-validation.md) para paths e limitações.

## Artefatos

```text
packages/device-adapters/src/huawei/hg8145v5/index.ts
packages/device-adapters/test/fixtures/huawei/hg8145v5/15ad-a-v5r020c00s270.json
```

## Limitações atuais

- Clientes conectados ainda não foram normalizados.
- Escrita de senha Wi-Fi permanece `experimental` até alteração e restauração controladas.
- Factory reset e firmware não serão testados neste equipamento.
- O firmware retornou valores XML inválidos em alguns campos WPS e timestamps de diagnóstico; esses campos não fazem parte do adapter.

## Captura segura

1. Atualize a árvore uma única vez; evite polling recorrente.
2. Mantenha a resposta NBI bruta fora do repositório.
3. Use `inventoryGenieAcsDevice` para revisar somente paths e tipos.
4. Use `sanitizeGenieAcsCapture` com allowlist mínima.
5. Redija serial, SSID, PPPoE, senha, MAC, IP, hostname e dados de cliente.
6. Revise manualmente a fixture antes do commit.
