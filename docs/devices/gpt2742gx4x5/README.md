# MitraStar GPT2742GX4X5 — dossiê de validação

## Estado

Suporte parcial verificado para a combinação real observada:

```text
Model/Product class: GPT-2742GX4X5v6
Hardware: tmp_hardware2.0
Software: GL_g1.10_100XNT0b14
Data model: TR-098
```

## Evidência

- Resposta NBI real observada em 2026-08-13; nenhum acesso ao MongoDB.
- A árvore inicial possuía somente 18 parâmetros; um Inform posterior entregou 2.543 valores e permitiu completar a descoberta de Wi-Fi.
- Identidade, firmware, IPv4 e IPv6 foram normalizados.
- A fixture sanitizada redige serial, IPv4 e SSID.
- Três WLANs foram observadas: uma de 2,4 GHz e duas de 5 GHz.
- As WLANs informaram rádio ativo, padrão `ax`, canais 11/149 e sete associações no total.
- `X_TELEFONICA_COM_Roaming.UniqueSSID` foi capturado como ativo.
- O caminho gravável de senha foi confirmado sem exibir ou armazenar o valor.

## Estado das ações

Leitura Wi-Fi 2,4/5 GHz está suportada. A escrita de senha está `experimental`; escrita de SSID, clientes identificados por nome, óptica, PPPoE e reboot permanecem `unknown`. Nenhuma escrita ou reboot foi enviado.

## Artefatos

```text
packages/device-adapters/src/gpt2742gx4x5/index.ts
packages/device-adapters/test/fixtures/gpt2742gx4x5/v6-hw2-b14.json
```

## Pendente

- descobrir WAN/PPPoE, óptica e clientes;
- testar SSID reversível e reboot somente em equipamento controlado.
