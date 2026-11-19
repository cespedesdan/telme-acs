# ExecPlan — M6: Modelos adicionais

## Propósito e resultado observável

Adicionar suporte verificável para HG8145V5-V2, RTF8225VW e GPT2742GX4X5 usando somente árvores capturadas dos equipamentos reais, mantendo a Web e a API dependentes apenas do modelo normalizado.

## Estado inicial

Em 2026-08-13, M0 a M5 estão implementados. O HG8145V5 `15AD.A / V5R020C00S270` possui fixture, adapter, testes e validação real. Outros equipamentos informam ao GenieACS, mas ainda usam o adapter genérico e permanecem com capabilities `unknown`.

## Escopo

- inventário de paths/tipos por NBI, sem consulta ao MongoDB;
- fixtures mínimas e sanitizadas por revisão/firmware real;
- adapters com identidade, leituras e escritas comprovadas;
- testes de matching, normalização e writes;
- validação manual segura nos equipamentos disponíveis;
- atualização da matriz de suporte e documentação por modelo.

## Fora do escopo

- suporte a revisões/firmwares não capturados;
- factory reset, firmware e operações em massa;
- paths inferidos por semelhança entre fabricantes ou modelos;
- lógica específica de modelo na API ou Web;
- integração IXC.

## Premissas e desconhecidos

- cada adapter ficará limitado ao hardware/firmware observado;
- leitura pode ser validada sem alterar o HGU;
- Wi-Fi write e reboot só serão declarados `supported` após teste controlado e confirmação posterior;
- modelos/revisões ausentes continuarão no fallback genérico como `unknown`.

## Componentes afetados

```text
packages/device-adapters
docs/devices
.agent/plans
README.md
```

## Marcos

1. Inventariar devices e revisões reais via GenieACS NBI.
2. Capturar apenas os parâmetros necessários e sanitizar fixtures.
3. Criar adapter mínimo por revisão/firmware observado.
4. Testar matching, reads, transforms e writes.
5. Validar no equipamento real sem operação destrutiva.
6. Atualizar documentação e executar checks completos.

## Validação planejada

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Resultados atualizados em 2026-08-18:

- `pnpm format:check`: passou;
- `pnpm lint`: passou;
- `pnpm typecheck`: passou;
- `pnpm test`: passou, incluindo 20 testes do pacote de adapters;
- `pnpm test:integration`: 3 testes HTTP passaram; teste PostgreSQL destrutivo ignorado sem `TEST_DATABASE_URL`;
- `pnpm build`: passou;
- API/Web real: REV3 retornou seis WLANs, `UNIQUE_SSID` ativo e duas associações; GPT retornou três WLANs, `UNIQUE_SSID` ativo e sete associações; REV4 exibiu três WLANs sem inventar banda ou estado unificado.
- Em 2026-08-18, a Web passou a mostrar o modo IPv4/IPv6, endereço ou estado desabilitado/não verificado. Os caminhos de senha capturados geram transforms validados, mas continuam bloqueados como `experimental` até teste reversível.
- A API local autenticada confirmou `IPv4/IPv6` no HG8145V5, RTF REV3 e GPT; a Web e a API responderam nas portas 3000/3101.

## Descobertas

- O GenieACS possui RTF8225VW REV3/V2.9, RTF8225VW-SV REV4/V2.39 e GPT-2742GX4X5v6/hw2/b14.
- Nenhum HG8145V5-V2 estava cadastrado ou informando em 2026-08-13.
- A REV3 expõe 3.244 parâmetros e permitiu confirmar WAN, PPPoE, seis instâncias Wi-Fi, banda, canal, estado, padrão, associações e `UNIQUE_SSID`.
- O GPT entregou 2.543 valores em novo Inform e permitiu validar três WLANs e `UNIQUE_SSID`; o RTF-SV continua parcial com 29 valores e atualização `queued`.
- A árvore REV3 não expôs um path óptico identificável; a capability permanece `unknown`.
- O refresh read-only de `Hosts` ainda não trouxe instâncias; a interface mostra a contagem disponível sem fabricar nomes de dispositivos.
- Capturas reais confirmaram IPv6 no HG8145V5, RTF REV3 e GPT, além de `PreSharedKey.1.KeyPassphrase` gravável; nenhum valor de senha foi exibido ou persistido.

## Decisões

- Reutilizar os helpers e o registry existentes; nenhuma dependência nova.
- Fixtures manterão SSID, PPPoE, IP, MAC e serial reais redigidos.
- Capability não comprovada permanece `unknown`, não `unsupported`.
- Writes/reboot mapeados mas ainda não validados ficam `experimental`; a API os bloqueia até promoção explícita para `supported`.
- A projeção NBI passou a ser composta pelo registry; controllers não carregam paths específicos de modelo.

## Progresso

- [x] Criar ExecPlan.
- [x] Inventariar modelos/revisões disponíveis.
- [x] Criar fixtures sanitizadas para os três devices disponíveis.
- [x] Implementar adapters e testes por revisão/firmware.
- [ ] Receber árvores completas pendentes e validar ações autorizadas.
- [x] Validar leituras reais disponíveis.
- [x] Atualizar resultados finais dos checks.

## Trabalho restante

Para concluir integralmente o M6: conectar um HG8145V5-V2; aguardar novo Inform do RTF-SV e GPT para executar as tasks de descoberta já enfileiradas; obter autorização/janela para escrita reversível de SSID e reboot no RTF REV3. O código disponível continua funcional sem esses dados, com capabilities limitadas honestamente.
