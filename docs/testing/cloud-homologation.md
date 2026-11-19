# Homologação convencional em nuvem

## Escopo

Instalação em VM Linux, com Node 24 LTS/pnpm 11.16.0 no host, infraestrutura Docker Compose e Nginx com HTTPS na frente da Web. Não exige Cloudflare Tunnel nem IXC. Templates não representam um deploy executado e não substituem validação no Linux de destino.

Escolhas ainda necessárias: VM/provedor, domínio, certificado TLS, VPN/allowlist para a equipe, usuários individuais e HGU de laboratório. Não copiar usuários, dados e segredos deste Windows para a nuvem sem política explícita de migração.

## 1. Preparar a VM

Instalar Node 24 LTS, pnpm na versão de `packageManager`, Docker/Compose e Nginx pelas ferramentas oficiais do host. Confirmar `node --version`, `pnpm --version` e portas livres. Criar usuário de serviço sem privilégios chamado `telme-acs`; instalar código em `/opt/telme-acs`, com permissão de escrita necessária para o cache Next. Os templates systemd assumem Node em `/usr/bin/node`; adaptar esse caminho à instalação real.

Instalar e compilar **na VM Linux**. O ZIP de fontes é portável, mas os builds/dependências gerados no Windows não são um artefato Linux validado.

```bash
cd /opt/telme-acs
pnpm install --frozen-lockfile
```

Criar `.env` a partir do exemplo apenas se ainda não existir. Gerar novos segredos de homologação, proteger o arquivo com permissão 0600, usuário de serviço como proprietário e diretório com acesso restrito. Não sobrescrever configuração de uma instalação existente.

Configurar:

```dotenv
NODE_ENV=production
API_HOST=127.0.0.1
API_PORT=3101
API_INTERNAL_URL=http://127.0.0.1:3101
WEB_HOST=127.0.0.1
WEB_PORT=3000
GENIEACS_CWMP_BIND_ADDRESS=127.0.0.1
```

Substituir todos os placeholders de senha/segredo. Sincronizar POSTGRES_PORT e DATABASE_URL. Cookies da API ficam Secure em produção; acessar a Web por HTTPS. Alterar API_INTERNAL_URL exige novo build porque rewrites são gravados pelo Next durante a compilação. A política de proxy não confia automaticamente em cabeçalhos externos; limite de login por origem pode ser compartilhado entre operadores atrás da Web. Uma única API é o limite atual, sem múltiplas réplicas.

## 2. Infraestrutura sem CPE

Subir somente os serviços necessários ao primeiro ciclo. Não iniciar CWMP nem serviços opcionais apenas para demonstrar a Web:

```bash
docker compose up -d --wait postgres redis mongo genieacs-nbi
docker compose ps
pnpm db:generate
pnpm db:validate
pnpm db:migrate:deploy
pnpm build
```

Em banco existente, fazer backup e verificar restauração em banco separado **antes** de aplicar migrations. Nunca usar `db:migrate:dev` em homologação compartilhada ou remover volumes com `down -v`.

Usar `pnpm admin:create` somente no primeiro bootstrap ou em uma atualização de operador explicitamente autorizada. Configurar usuário individual e senha de teste em `.env`, executar o bootstrap e remover TELME_ADMIN_PASSWORD do arquivo depois. Não há provisionamento automático de contas da equipe nem permissão para inventar seus e-mails.

## 3. Inicialização e operação

Teste foreground: `pnpm start` inicia API, Web standalone e worker, sem iniciar Docker nem aplicar migrations. Para operação contínua, usar os três templates em `infrastructure/systemd/`, revisar caminhos/usuário e instalar como unidades systemd. Os templates não criam a infraestrutura; verificar readiness ao reiniciar a VM.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now telme-acs-api telme-acs-web telme-acs-worker
sudo systemctl status telme-acs-api telme-acs-web telme-acs-worker
```

Para parar somente as apps:

```bash
sudo systemctl stop telme-acs-web telme-acs-api telme-acs-worker
```

Configurar monitoramento/retenção dos logs do journal. Não registrar credenciais ou árvore de assinantes. O serviço Web serve o entrypoint standalone correto e o build copia static/public; ausência de build falha explicitamente.

## 4. HTTPS e acesso restrito

Adaptar `infrastructure/nginx/web-homologation.conf.example`: domínio real, certificados válidos e política de acesso por VPN/allowlist antes de publicar. O template bloqueia acesso externo por padrão (`deny all` após loopback); substituir a allowlist somente por CIDRs verificados da equipe/VPN. Verificar `nginx -t` no host antes de reload. O template é só Web, não CWMP e não NBI. Manter API 3101, NBI 7557, FS 7567, UI GenieACS, PostgreSQL, Redis e Mongo privados.

No firewall da VM/provedor, liberar HTTPS 443 apenas para a equipe/VPN nesta etapa; SSH administrativo restrito. Portas de banco não devem ser liberadas. Não usar development server para acesso externo. Se for necessário HTTP 80 para emissão de certificados/redirecionamento, fazê-lo sob política explícita do domínio e do certificado.

## 5. Gate de testes

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm audit --prod
curl --fail http://127.0.0.1:3101/api/v1/health
curl --fail http://127.0.0.1:3101/api/v1/health/ready
curl --fail http://127.0.0.1:3000/api/health
pnpm --filter @telme/worker health
```

O health do worker envia somente um job `health` à fila de sistema e aguarda resposta em até cinco segundos, comprovando consumo além do PING Redis. Não envia operações a CPEs.

Executar `pnpm test:integration` com TEST_DATABASE_URL em banco descartável `_test`, nunca com a URL operacional. Aplicar as migrations no banco de teste primeiro. Login e navegação pela URL **HTTPS pública**, RBAC por perfil e restrição externa precisam de validação no servidor escolhido. Checks locais não aprovam automaticamente esse gate.

## 6. Backup e rollback

Antes de cada upgrade, preservar ZIP/versão de fontes, `.env` protegido e backup PostgreSQL fora do diretório da aplicação, com acesso restrito e retenção definida. Restaurar backup em banco descartável e comparar contagens. Para rollback de código sem mudança de schema: parar somente apps, restaurar fontes/lockfile anteriores, instalar com lockfile congelado, compilar no Linux e reiniciar unidades. Não apagar volumes. Schema incompatível exige plano específico de restauração; esta entrega não adiciona migrations.

## 7. Gate físico e IXC

Não há HGU de laboratório nem domínio CWMP de nuvem selecionados nesta etapa. Somente após autorização e revisão da fila, configurar HTTPS/CWMP dedicado, autenticação GenieACS e firewall; validar Inform completo e leitura. Não compartilhar regras de login interativo da Web com o endpoint dos modems. SSID/reboot/firmware não estão autorizados por este preparo.

IXC continua opcional e só entra após estabilidade e homologação do núcleo. Ver o [roteiro antes do IXC](pre-ixc-validation.md).
