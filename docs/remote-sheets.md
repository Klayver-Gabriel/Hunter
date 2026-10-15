# Contas e fichas remotas

## Requisitos

- Node.js 24 e npm, ou Docker com Docker Compose.
- PostgreSQL pelo Docker Compose ou por conexão externa.
- Cliente OAuth Google do tipo aplicação Web.
- Domínio HTTPS para produção.

O serviço Node serve o frontend e a API na mesma origem. Usuários, sessões e fichas são armazenados no PostgreSQL. O conteúdo das fichas utiliza JSONB, com metadados de proprietário, schema, revisão e datas. O Compose padrão utiliza um banco em container com volume no host do Docker; `compose.remote.yaml` utiliza o banco externo indicado em `DATABASE_URL`.

## Configuração

Para Docker Compose, execute `npm run docker:setup`. O comando cria ou completa `.env` e gera senhas de banco com 64 caracteres. Valores já preenchidos são preservados.

Para execução direta com Node, instale as dependências com `npm ci`, copie `.env.example` para `.env` e configure `DATABASE_URL` com a conexão PostgreSQL.

Preencha `.env` com a configuração do ambiente:

| Variável | Configuração |
| --- | --- |
| `PUBLIC_URL` | Origem pública HTTPS, sem caminho; HTTP permitido em loopback |
| `GOOGLE_CALLBACK_URL` | Mesma origem de `PUBLIC_URL`, com caminho `/auth/google/callback` |
| `GOOGLE_CLIENT_ID` | Identificador do cliente OAuth Google |
| `GOOGLE_CLIENT_SECRET` | Segredo do cliente OAuth Google |
| `DATABASE_URL` | Conexão PostgreSQL para `npm start` e `compose.remote.yaml`; use `sslmode=verify-full` no banco externo |
| `POSTGRES_ADMIN_PASSWORD` | Senha administrativa do PostgreSQL do Compose, utilizada pelo banco e pela migração |
| `POSTGRES_RUNTIME_PASSWORD` | Senha do usuário `hunter_runtime`, utilizada pela aplicação |
| `APP_PORT` | Porta publicada pelo Compose em loopback; padrão `4173` |
| `HOST` | Interface interna; padrão `127.0.0.1` |
| `PORT` | Porta interna; padrão `4173` |
| `SESSION_SECONDS` | Validade da sessão em segundos; padrão `28800` |
| `MAX_BODY_BYTES` | Tamanho máximo do corpo JSON da API; padrão `1048576` bytes |
| `TRUSTED_PROXY_IPS` | IPs exatos do proxy conectado diretamente ao serviço, separados por vírgula |
| `RATE_AUTH_START` | Inícios de login por IP a cada minuto; padrão `20` |
| `RATE_AUTH_CALLBACK` | Callbacks de login por IP a cada minuto; padrão `40` |
| `RATE_READ` | Leituras por usuário a cada minuto; padrão `300` |
| `RATE_SAVE` | Gravações por usuário a cada minuto; padrão `120` |
| `RATE_MUTATION` | Criações, importações, exclusões e logouts por usuário a cada minuto; padrão `30` |

Armazene credenciais em `.env` ou no gerenciador de segredos da hospedagem. As senhas do Compose devem ter pelo menos 32 caracteres, utilizando letras, números, `_` ou `-`. Configure a CA do PostgreSQL externo conforme os parâmetros de [TLS do node-postgres](https://node-postgres.com/features/ssl). O pool utiliza até 10 conexões por instância da aplicação.

### Google OAuth

1. Configure a tela de consentimento e crie um cliente OAuth do tipo aplicação Web no Google.
2. Cadastre a origem definida em `PUBLIC_URL`.
3. Cadastre exatamente a URL definida em `GOOGLE_CALLBACK_URL` como URI de redirecionamento autorizada.
4. Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no ambiente do backend.
5. Durante a fase de teste da aplicação OAuth, cadastre as contas autorizadas como usuários de teste.

Exemplo para desenvolvimento:

```dotenv
PUBLIC_URL=http://127.0.0.1:4173
GOOGLE_CALLBACK_URL=http://127.0.0.1:4173/auth/google/callback
```

O login utiliza Authorization Code, state, nonce e PKCE S256, com os escopos `openid profile`. A identidade da conta corresponde ao par `(issuer, subject)`.

### PostgreSQL externo

Aplique a migração com um papel autorizado a criar tabelas e índices:

```sh
npm run db:migrate
```

A migração cria as tabelas com prefixo `hunter_`. Configure o papel de execução da aplicação com estas permissões:

| Recurso | Permissões |
| --- | --- |
| Banco | `CONNECT` |
| Schema da aplicação | `USAGE` |
| `hunter_users`, `hunter_sheets` | `SELECT`, `INSERT`, `UPDATE` |
| `hunter_sessions`, `hunter_auth_flows`, `hunter_rate_limits` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |

Restrinja o acesso de rede do PostgreSQL aos serviços autorizados. Para múltiplas instâncias da aplicação, dimensione o limite de conexões do banco ou configure um pooler.

## Execução

```sh
npm start
```

O serviço escuta na interface e porta configuradas. A rota `GET /healthz` retorna `200` com `{"ok":true}` quando a conexão com o banco está disponível.

### Docker Compose com PostgreSQL

Prepare o arquivo de ambiente:

```sh
npm run docker:setup
```

Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env`. Configure a origem e o callback conforme o cliente Google. Para iniciar:

```sh
npm run docker:up
```

O comando constrói a imagem com `docker build` e inicia a composição. A ordem de inicialização é `db saudável → migrate concluído → app`. O serviço `migrate` aplica o schema e configura o usuário `hunter_runtime` com as permissões da tabela de PostgreSQL externo. A aplicação recebe a conexão desse usuário; a senha administrativa é fornecida aos serviços `db` e `migrate`.

O compose publica `127.0.0.1:4173` e mantém o PostgreSQL na rede interna `database`. Os dados ficam no volume nomeado `postgres_data`, armazenado no host do Docker. O container da aplicação utiliza usuário sem privilégios e filesystem somente leitura.

Para usar apenas a CLI Docker, prepare `.env` a partir de `.env.example`, configure as senhas e o OAuth e execute:

```sh
docker build -t hunters-codex:local .
docker compose up -d --no-build
```

Para gerar `.env` sem Node instalado no host, execute o utilitário pela imagem Node:

```sh
docker run --rm --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$PWD,target=/workspace" \
  -w /workspace node:24-alpine node scripts/setup-docker.js
```

Ao alterar `APP_PORT`, atualize `PUBLIC_URL`, `GOOGLE_CALLBACK_URL` e o callback cadastrado no Google com a mesma porta externa.

Para verificar o serviço:

```sh
docker compose ps
docker compose logs app migrate
curl --fail http://127.0.0.1:4173/healthz
```

Para parar os serviços preservando os dados:

```sh
docker compose down
```

O volume é reutilizado na próxima inicialização. A opção `docker compose down --volumes` remove os dados do banco.

### Container com PostgreSQL externo

Configure `DATABASE_URL` no `.env`, aplique a migração com o papel administrativo e inicie a aplicação com o usuário de execução:

```sh
docker build -t hunters-codex:local .
docker compose -f compose.remote.yaml up -d --no-build
```

Para executar a migração pelo container, forneça uma URL administrativa por variável de ambiente do shell e execute:

```sh
docker compose -f compose.remote.yaml run --rm \
  -e DATABASE_URL="$MIGRATION_DATABASE_URL" app node scripts/migrate.js
```

Essa composição executa o serviço da aplicação com a persistência no PostgreSQL externo.

## Domínio e proxy

Configure `PUBLIC_URL` com a origem HTTPS pública e encaminhe `/`, `/auth/*` e `/api/*` ao serviço da aplicação. Mantenha as respostas de `/api/*` e `/auth/*` com cache desativado. Restrinja o acesso à porta interna ao proxy.

Callbacks e cookies utilizam a origem configurada em `PUBLIC_URL`. Os cookies de produção têm prefixo `__Host-` e atributos `HttpOnly`, `Secure`, `SameSite=Lax` e `Path=/`. As requisições de API utilizam a mesma origem do frontend.

### Cloudflare Tunnel

Crie o túnel e configure o hostname no Cloudflare. Exemplo com `cloudflared` executado no mesmo host da aplicação:

```yaml
tunnel: SEU-TUNNEL-ID
credentials-file: /caminho/privado/tunnel.json
ingress:
  - hostname: hunter.example.com
    service: http://127.0.0.1:4173
  - service: http_status:404
```

Configure o ambiente da aplicação:

```dotenv
PUBLIC_URL=https://hunter.example.com
GOOGLE_CALLBACK_URL=https://hunter.example.com/auth/google/callback
```

Com `cloudflared` em outro container, conecte-o à rede Docker da aplicação. Para uma composição com nome de projeto `hunter`:

```sh
docker network connect hunter_default SEU_CONTAINER_CLOUDFLARED
docker update --restart unless-stopped SEU_CONTAINER_CLOUDFLARED
```

Na rota **Published application**, configure **Service URL** como `http://app:4173`. O endereço `127.0.0.1` dentro do container do túnel corresponde ao próprio container. Mantenha o banco na rede interna `database`.

O hostname deve pertencer a um domínio registrado e configurado no DNS. Criar um túnel ou preencher o hostname da rota não registra um domínio. Antes de aplicar a origem pública ao aplicativo, confirme a resolução DNS e cadastre o callback HTTPS no cliente OAuth Google. Em seguida, ajuste `PUBLIC_URL` e `GOOGLE_CALLBACK_URL` no `.env` e execute:

```sh
docker compose up -d --no-build app
```

Valide `https://SEU_HOSTNAME/healthz`, a tela inicial e o login Google pelo domínio.

### Quick Tunnel

Para criar uma URL temporária com `cloudflared` em Docker, inicie a aplicação e execute na rede do projeto `hunter`:

```sh
docker run -d --name cheets-quick-tunnel --network hunter_default \
  --read-only --cap-drop ALL cloudflare/cloudflared:latest \
  tunnel --no-autoupdate --url http://app:4173
docker logs cheets-quick-tunnel
```

Copie a URL `https://....trycloudflare.com` exibida no log. Configure `PUBLIC_URL` com essa origem e `GOOGLE_CALLBACK_URL` com a mesma origem seguida de `/auth/google/callback`. Cadastre o callback nas URIs de redirecionamento autorizadas do cliente Google e aplique o ambiente:

```sh
docker compose up -d --no-build app
```

Para encerrar o Quick Tunnel:

```sh
docker stop cheets-quick-tunnel
```

A URL deixa de funcionar quando o processo termina. Criar outro Quick Tunnel gera um novo endereço; atualize as duas variáveis e o callback Google. Para reutilizar o nome do container em uma nova criação, remova o container parado com `docker rm cheets-quick-tunnel`. Para voltar ao login local, configure `PUBLIC_URL=http://127.0.0.1:4173` e `GOOGLE_CALLBACK_URL=http://127.0.0.1:4173/auth/google/callback` e aplique novamente o ambiente. Os Quick Tunnels são destinados a testes e não possuem garantia de disponibilidade.

### Endereço IP do cliente

`TRUSTED_PROXY_IPS` vazio utiliza o endereço da conexão para os limites por IP. Para identificar clientes por `X-Forwarded-For`:

1. Configure o ingress para sobrescrever o cabeçalho ou acrescentar o IP real ao final da lista.
2. Preencha `TRUSTED_PROXY_IPS` com o endereço exato do salto diretamente conectado ao backend, incluindo a representação IPv4-mapped quando aplicável.
3. Restrinja o acesso à interface do backend ao ingress configurado.

O backend utiliza o último IP válido do cabeçalho recebido por esse proxy. Os limites por usuário são compartilhados entre abas, dispositivos e instâncias da aplicação.

## Uso das fichas

1. Na tela inicial **Cheets**, clique em **Entrar com Google**.
2. Selecione a conta Google. A autenticação ocorre na mesma janela e retorna à tela principal.
3. Abra **Fichas**, primeiro item da barra lateral. Use **Abrir ficha**, selecione uma opção em **Minhas fichas** e clique em **Abrir da conta**. Para iniciar outro personagem, use **Nova ficha**.
4. Edite os campos. Confirme campos de texto com Enter ou ao retirar o foco; campos numéricos são confirmados ao alterar o foco.
5. Acompanhe o indicador de salvamento.

**Salvar ficha → Salvar na conta** confirma o salvamento do documento ativo. Editar a ficha vazia também cria uma ficha na conta pelo autosave. **Salvar ficha → Salvar como JSON** baixa o documento ativo, incluindo personagem, aparência e configurações de cálculo.

**Abrir ficha → Escolher arquivo JSON** solicita confirmação e cria uma ficha na conta com o conteúdo do arquivo. O arquivo é validado antes da substituição da ficha ativa.

Para usar fichas locais, escolha **Usar armazenamento local** na tela inicial. A escolha é mantida durante a sessão da aba. Na aba **Fichas**, use **Voltar ao início** para retornar à tela de entrada. As opções de JSON permanecem disponíveis; as opções da conta exigem login.

### Autosave

O autosave remoto utiliza debounce de 700 ms e uma fila com uma gravação por vez.

| Estado | Ação |
| --- | --- |
| Alterações pendentes | Aguarde o início da gravação |
| Salvando | Aguarde a resposta do servidor |
| Salvo | Persistência confirmada pelo banco |
| Erro ao salvar | Verifique a conexão e use **Fichas → Salvar ficha → Salvar na conta** |
| Conflito de versão | Abra **Salvar ficha** e use **Salvar como cópia na conta** ou **Salvar como JSON** |
| Entre novamente para salvar | Autentique-se na mesma conta para retomar a gravação |

As alterações pendentes permanecem na memória da página. Exporte o JSON antes de fechar ou recarregar a página durante uma falha de salvamento. O aviso de saída depende do suporte e do comportamento do navegador.

O controle de concorrência utiliza atualização atômica por proprietário e revisão. Fingerprints SHA-256 identificam o conteúdo; chaves de criação e identificadores de mutação permitem repetir requisições com a mesma identidade de operação. **Salvar como cópia na conta** cria uma ficha com outro ID.

### Importação de fichas do navegador

1. Entre na conta de destino.
2. Acesse **Fichas → Abrir ficha → Importar fichas deste navegador para minha conta**.
3. Confira nome, origem e tamanho de cada ficha apresentada.
4. Selecione as fichas e clique em **Confirmar importação das selecionadas**.
5. Aguarde a confirmação e confira as fichas na lista da conta.

A prévia inclui a ficha atual, a chave legada e o backup local. Os originais permanecem no navegador após a importação. Conteúdos originais idênticos utilizam uma chave estável para deduplicação. Para duplicar intencionalmente uma ficha, use **Salvar como cópia na conta**.

Fichas locais com erro de leitura podem ser recuperadas pelo fluxo descrito no [README](../README.md#formato-e-recuperação). Para remover dados locais de um computador compartilhado, exporte o conteúdo necessário e limpe o armazenamento da origem nas configurações do navegador.

### Sessões e troca de conta

A sessão tem a validade definida em `SESSION_SECONDS`. Ao expirar, use **Entrar com Google** com a mesma conta para recuperar a edição pendente.

**Sair** encerra a sessão da aplicação e solicita confirmação de descarte quando existem alterações pendentes. Outras abas recebem a notificação de logout e ocultam a ficha. Uma edição oculta pode ser recuperada na mesma conta enquanto a página permanecer aberta.

A aplicação revalida a conta ao receber foco e verifica a identidade da sessão em cada requisição. As fichas remotas e os rascunhos permanecem na memória da página durante a edição. O armazenamento local contém as fichas do modo local e a preferência de tema.

Ao iniciar uma reautenticação, a edição ativa e as operações pendentes são guardadas temporariamente em `sessionStorage`, na chave `cheets:login-recovery:v1`, com o ID da conta e validade de 15 minutos. O retorno na mesma conta recupera a edição e reutiliza as chaves das operações pendentes. A recuperação é removida ao restaurar a edição, ao sair da conta ou na próxima leitura após a expiração. O retorno em outra conta mantém o rascunho isolado da nova sessão. A escolha do modo local utiliza `cheets:entry-mode`, removida ao voltar ao início ou iniciar login. Cookies de sessão permanecem HttpOnly.

### Exclusão e recuperação

Abra a ficha, acesse **Fichas**, clique em **Excluir ficha da conta** e confirme. A exclusão registra `deleted_at` e remove a ficha da listagem.

Para recuperação administrativa, faça backup, valide o proprietário e o ID da ficha e execute esta consulta parametrizada pela ferramenta de administração:

```sql
UPDATE hunter_sheets
SET deleted_at = NULL, revision = revision + 1, updated_at = now()
WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL;
```

Reabra a ficha após a recuperação para carregar a revisão atualizada. A recuperação de versões anteriores à última edição depende dos backups do banco ou de exportações JSON.

## Limites e manutenção

Os contadores de rate limiting são armazenados no PostgreSQL, com janelas de 60 segundos. A API aplica os limites por usuário definidos em `RATE_READ`, `RATE_SAVE` e `RATE_MUTATION`, além de um limite por IP equivalente a cinco vezes cada valor. O início e o callback de autenticação utilizam os limites específicos por IP.

Respostas `429` incluem o cabeçalho `Retry-After` em segundos. Aguarde esse intervalo antes de repetir a operação. Ajuste os limites conforme a quantidade de abas, dispositivos e usuários atendidos pelo ingress. Configure a proteção de tráfego de rede no proxy.

O corpo JSON completo está sujeito a `MAX_BODY_BYTES`, profundidade máxima de 30 e até 50000 nós. O título da ficha aceita até 200 caracteres. A validação também verifica schema, cálculos, aparência e chaves de objetos.

Agende diariamente a limpeza de registros operacionais expirados:

```sh
npm run db:cleanup
```

Pelo Docker Compose:

```sh
docker compose exec -T app node scripts/cleanup.js
```

O comando remove sessões, fluxos OAuth e contadores expirados. Fichas, usuários e registros de exclusão são preservados. Configure os logs do proxy para omitir cookies, cabeçalhos privados e parâmetros do callback OAuth.

## Backup e restauração

Configure backups criptografados e recuperação pontual (PITR) no provedor PostgreSQL externo. Defina retenção, RPO e RTO e teste a restauração em uma instância isolada. Mantenha exportações JSON para recuperação individual de fichas.

Para exportar o banco do Compose, execute em um diretório reservado aos backups:

```sh
docker compose exec -T db pg_dump -U hunter_admin -d hunter -Fc > hunter.dump
```

Armazene os arquivos de backup em um destino separado do host da aplicação. Restaure com `pg_restore` em um banco isolado e valide o conteúdo antes da troca de ambiente. A senha administrativa do PostgreSQL é definida na inicialização do volume; a rotação exige atualização da senha do papel no banco e do valor correspondente no `.env`.

Para restaurar o serviço:

1. Restaure o backup em outro banco.
2. Valide a quantidade de fichas, os proprietários, o conteúdo e as revisões.
3. Invalide as sessões e os fluxos OAuth restaurados.
4. Interrompa temporariamente as gravações da aplicação.
5. Atualize `DATABASE_URL` e reinicie o serviço.
6. Valide o healthcheck, o login e as operações de fichas.

Para reverter uma versão da aplicação, interrompa as edições, faça backup dos dados remotos, preserve as tabelas e inicie a versão desejada. Uma versão exclusivamente estática utiliza arquivos JSON exportados e os dados locais do navegador.

Ao mudar o domínio da aplicação, exporte as fichas locais antes de alterar a origem e atualize `PUBLIC_URL`, `GOOGLE_CALLBACK_URL` e a configuração do cliente Google.

## Verificação

```sh
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

Para os testes de integração, crie um banco PostgreSQL local descartável com nome terminado em `_test` e configure `TEST_DATABASE_URL`:

```sh
TEST_DATABASE_URL=postgresql://hunter_test:fake@127.0.0.1:5432/hunter_remote_test npm run test:integration
```

A suíte cria um schema temporário por execução e o remove ao terminar. Os testes de autenticação usam tokens assinados por chaves de teste e transporte simulado.

Para validar a composição Docker:

```sh
npm run test:docker
```

O teste cria um projeto Docker exclusivo, com ambiente, porta e volume temporários. Verifica a migração, as permissões do usuário da aplicação, o healthcheck, a gravação e a persistência após recriar os containers. A descoberta OIDC utiliza um adaptador de teste. Os recursos do projeto temporário são removidos ao concluir.

Na validação do ambiente de destino, verifique login Google, callback HTTPS, expiração de sessão, logout, isolamento entre contas, criação, abertura, edição, exclusão e recuperação de conflitos. Confira também a persistência após reiniciar o serviço e o acesso por proxy ou túnel.
