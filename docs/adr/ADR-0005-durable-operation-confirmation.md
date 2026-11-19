# ADR-0005: Operações duráveis e confirmação independente

## Status

Accepted

## Context

Enviar uma tarefa antes de gravar a intenção pode perder o histórico em falha de banco. Respostas HTTP perdidas permitem duplicação em retries. Ausência da tarefa no GenieACS não comprova aplicação; o cache de SetParameterValues contém o valor enviado, não necessariamente uma leitura independente.

## Decision

Persistir operação e auditoria numa transação antes do NBI. Usar UUID fornecido pela solicitação como chave única; fingerprint HMAC com segredo de sessão evita armazenar senha ou hash simples de segredo. Repetição compatível retorna a mesma operação; incompatível é conflito. Não reenviar comandos automaticamente após resultado incerto.

Reconciliação da API consulta exclusivamente NBI. SSID exige tarefa de leitura posterior, ausência de fault e folhas mais recentes que a intenção dessa leitura com valores correspondentes. Reboot exige BOOT posterior observado; refresh exige folhas recentes. Operações não verificáveis não são descritas como aplicadas.

Prazo ISO absoluto acompanha a task. Cancelar tarefa conhecida antes de registrar falha por fault ou expiração; indisponibilidade do NBI preserva estado pendente. Limitar histórico a leituras locais e não bloquear navegação na reconciliação. Registros legados sem contrato de confirmação ficam para revisão manual.

## Consequences

Um HTTP 200 do GenieACS pode continuar `queued` na camada TELME até obter evidência. Isso privilegia estado observável, não apenas aceitação do RPC. Cada SSID confirmado requer uma leitura posterior seletiva. Senhas ilegíveis e capabilities experimentais continuam exigindo laboratório.

Chaves reutilizadas precisam acompanhar o mesmo conteúdo; a Web mantém a chave ao repetir uma resposta incerta na mesma sessão. Reload ou outro cliente deve consultar o histórico antes de nova solicitação. Rotacionar SESSION_SECRET também muda fingerprints existentes: planejar isso com operações pendentes e sessões. Recuperar uma task aceita sem ID conhecido e reconciliar registros antigos são ações manuais, não reenvio cego.

A implementação atual possui uma única API e timer local. Para escalar horizontalmente, usar coordenação/locks compartilhados, distribuir a reconciliação e migrar a limitação de login para Redis. Task ausente e timestamp são evidências condicionadas ao contrato da operação; escritas externas concorrentes devem ser consideradas na homologação.
