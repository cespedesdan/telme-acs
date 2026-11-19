# RBAC inicial

As permissions, e não o nome da role, são a unidade de autorização. Usuários inativos e roles desconhecidas são sempre negados.

| Role               | Acesso inicial                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `ADMIN`            | Todas as permissions, incluindo administração                                                                  |
| `NOC`              | Operação completa de devices, firmware, lote, vínculos e auditoria; sem administração de usuários/configuração |
| `SUPPORT_L2`       | Leitura/refresh, Wi-Fi, óptica, reboot, leitura WAN/firmware e auditoria                                       |
| `SUPPORT_L1`       | Leitura/refresh, Wi-Fi, óptica e reboot                                                                        |
| `FIELD_TECHNICIAN` | Leitura/refresh, Wi-Fi, óptica, reboot e leitura WAN                                                           |
| `READ_ONLY`        | Leitura de devices, Wi-Fi, óptica, WAN, firmware e auditoria                                                   |

Support L1 não recebe `device.factory_reset`, `wan.read`, `wan.write`, `firmware.read`, `firmware.deploy` nem `batch.execute`.

Factory reset, firmware, escrita WAN e operações em massa continuam exigindo confirmação explícita além da permission. Uma permission nunca elimina validação, auditoria ou controles de segurança da operação.
