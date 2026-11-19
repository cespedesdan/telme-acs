# ADR-0001: Fronteira entre TELME ACS e GenieACS

## Status

Accepted

## Context

O TELME ACS precisa administrar CPEs por TR-069/CWMP sem assumir a complexidade de um ACS próprio. O GenieACS já fornece o motor CWMP, armazenamento e mecanismos de extensão. A aplicação TELME deve concentrar regras de negócio, integração IXC, modelo normalizado, autorização, auditoria e experiência dos operadores.

Acesso direto ao MongoDB do GenieACS ou chamadas NBI espalhadas pelos aplicativos criariam acoplamento ao armazenamento interno, dificultariam upgrades e ampliariam a superfície de segurança.

## Decision

- O GenieACS é o único responsável por CWMP e por seu MongoDB.
- Código TELME acessa o GenieACS exclusivamente pela NBI/API, encapsulada em `packages/genieacs-client`.
- Provisions, presets, virtual parameters, extensions e configuração são os pontos permitidos de customização.
- O TELME ACS nunca consulta o MongoDB do GenieACS diretamente.
- Controllers e componentes Web usam operações e modelos normalizados; paths TR-069 ficam nos adapters.
- Uma task aceita pelo GenieACS pode estar apenas enfileirada. Estados TELME distinguem `executed`, `queued`, `failed` e `timed_out`.
- Alterar o core do GenieACS exige necessidade comprovada e uma nova decisão que documente escopo, testes e impacto de upgrade.

## Consequences

- A fronteira de propriedade e segurança fica explícita, e upgrades do GenieACS tendem a afetar apenas o client e as extensões controladas.
- Indisponibilidade da NBI impede ou posterga operações TELME; o sistema deve mostrar esse estado sem declarar aplicação concluída.
- Testes automatizados simulam a NBI e não dependem do MongoDB, de CPE físico ou do IXC de produção.
- Recursos não expostos por mecanismos suportados permanecem indisponíveis até existir evidência para outra decisão; nenhum path de fabricante será inventado.
