# ADR-0002: Adapters e evidência de capabilities

## Status

Accepted

## Context

Os CPEs podem expor TR-098, TR-181, árvores de fabricante ou combinações diferentes conforme hardware e firmware. Espalhar caminhos CWMP pela API ou Web acoplaria o produto a equipamentos específicos e incentivaria suposições perigosas.

No M2 ainda não existem capturas reais sanitizadas dos modelos iniciais. Portanto, reconhecer o modelo de dados genérico não comprova suporte a Wi-Fi, óptica, WAN, reboot ou firmware.

## Decision

- O frontend e as regras de negócio usam `NormalizedDevice` e `DeviceCapabilities`.
- Todo acesso a parâmetros usa `packages/device-adapters`; paths verificados não saem dos adapters.
- O registry resolve adapters específicos antes do fallback `generic`.
- O fallback detecta somente as raízes padronizadas `InternetGatewayDevice.*` e `Device.*` e mantém todas as capabilities como `unknown`.
- `unknown` significa falta de evidência; `unsupported` exige evidência de que o recurso não existe ou não funciona.
- Uma fixture registra origem, data, identidade sanitizada e árvore de parâmetros. Dados sintéticos devem ser marcados `synthetic-test` e não servem como evidência de suporte.
- Adapters de modelo só serão adicionados após captura sanitizada do modelo, hardware e firmware correspondentes.

## Consequences

- Controllers e UI permanecem independentes de caminhos CWMP.
- Novos equipamentos exigem descoberta e testes, mas não forçam condicionais espalhadas pelo produto.
- No estado atual, a matriz dos quatro modelos iniciais permanece `Unknown/Discover`.
- Fixtures reais precisam passar por sanitização para remover credenciais e dados de assinantes antes do commit.
