# Descoberta de dispositivos e matriz de suporte

O HG8145V5 `15AD.A / V5R020C00S270` possui suporte validado completo do MVP. O RTF8225VW REV3 possui seis WLANs inventariadas, `UNIQUE_SSID` e contagem de associações verificados; suas ações continuam experimentais. O GPT-2742GX4X5v6 possui três WLANs e `UNIQUE_SSID` verificados para leitura. O RTF8225VW-SV REV4 continua parcial. Hardware e firmware diferentes permanecem `Unknown/Discover`.

## Workflow

1. conectar um CPE controlado ao GenieACS;
2. capturar identidade, hardware, firmware e árvore relevante;
3. inventariar somente paths/tipos com `inventoryGenieAcsDevice`;
4. sanitizar uma allowlist mínima com `sanitizeGenieAcsCapture`;
5. revisar o JSON antes de incluí-lo no repositório;
6. implementar matching e mappings somente para a revisão comprovada;
7. testar leitura, transform e escrita reversível;
8. registrar limitações e atualizar a matriz.

## Matriz

| Modelo/revisão            | Identity  | Firmware  | WAN       | PPPoE     | IPv4/IPv6             | Optical RX/TX | Wi-Fi 2.4/5 | SSID / senha                | Clients | Reboot       | Factory reset | Firmware upgrade |
| ------------------------- | --------- | --------- | --------- | --------- | --------------------- | ------------- | ----------- | --------------------------- | ------- | ------------ | ------------- | ---------------- |
| HG8145V5 15AD.A / S270    | Supported | Read-only | Read-only | Read-only | Read-only / Read-only | Read-only     | Supported   | Supported / Experimental    | Unknown | Supported    | Unknown       | Unknown          |
| HG8145V5-V2               | Unknown   | Unknown   | Unknown   | Unknown   | Unknown               | Unknown       | Unknown     | Unknown                     | Unknown | Unknown      | Unknown       | Unknown          |
| RTF8225VW REV3 / V2.9     | Supported | Read-only | Read-only | Read-only | Read-only / Read-only | Unknown       | Supported   | Experimental / Experimental | Unknown | Experimental | Unknown       | Unknown          |
| RTF8225VW-SV REV4 / V2.39 | Supported | Read-only | Unknown   | Unknown   | Read-only / Unknown   | Unknown       | Unknown     | Unknown                     | Unknown | Unknown      | Unknown       | Unknown          |
| GPT-2742GX4X5v6 / b14     | Supported | Read-only | Unknown   | Unknown   | Read-only / Read-only | Unknown       | Supported   | Unknown / Experimental      | Unknown | Unknown      | Unknown       | Unknown          |

Nunca grave a resposta NBI bruta no repositório. A detecção automática de nomes sensíveis é apenas uma barreira adicional; revisão humana continua obrigatória.
