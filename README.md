# Cheets

Ficha de personagem em JavaScript com cálculos locais, importação/exportação JSON e editor de aparência. O modo local utiliza arquivos estáticos. O modo remoto utiliza login Google, API na mesma origem e PostgreSQL.

Na tela inicial, selecione **Entrar com Google** para acessar as fichas da conta ou **Usar armazenamento local** para abrir as fichas deste navegador. O login Google utiliza redirecionamento na mesma janela e retorna à tela principal.

A aba **Fichas**, primeiro item da barra lateral, reúne as operações de arquivos e conta:

- **Salvar ficha** abre as opções **Salvar na conta** e **Salvar como JSON**. O JSON inclui personagem, aparência e configurações de cálculo.
- **Abrir ficha** permite selecionar uma ficha da conta ou escolher um arquivo JSON. Ao abrir um JSON autenticado, confirme a criação da ficha na conta.
- **Nova ficha** inicia outro personagem. **Excluir ficha da conta** remove a ficha ativa da lista remota.

Com login, as edições são salvas automaticamente na conta. No modo local, o autosave grava neste navegador; as operações da conta exigem login.

Consulte [autenticação, persistência e implantação](docs/remote-sheets.md) para configurar Google, banco, domínio, proxy/túnel, migração e recuperação.

## Docker

Prepare o ambiente:

```sh
npm run docker:setup
```

Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env`. Cadastre `http://127.0.0.1:4173/auth/google/callback` como URI de redirecionamento autorizada do cliente Google.

```sh
npm run docker:up
```

Abra `http://127.0.0.1:4173`. O Compose inicia PostgreSQL, aplica a migração e inicia a aplicação. As senhas do banco são geradas pelo comando de configuração. Os dados ficam no volume Docker `postgres_data`, no host do Docker.

Para iniciar também o túnel ngrok, configure `COMPOSE_PROFILES=ngrok`, `NGROK_AUTHTOKEN`, `PUBLIC_URL` com seu domínio HTTPS do ngrok e `GOOGLE_CALLBACK_URL` com essa origem seguida de `/auth/google/callback` no `.env`. Execute `npm run docker:up` novamente. O túnel usa `restart: always` para voltar automaticamente quando o Docker iniciar após reiniciar o computador. O Docker deve estar habilitado para iniciar com o sistema. Consulte o [guia do ngrok](docs/remote-sheets.md#ngrok-no-docker-compose).

```sh
npm run docker:logs
npm run docker:down
```

`docker:down` preserva o volume de dados. Para PostgreSQL externo, utilize [compose.remote.yaml](compose.remote.yaml) conforme o [guia de execução](docs/remote-sheets.md#postgresql-externo).

## Desenvolvimento

Use Node.js 24 e npm:

```sh
npm ci
npm run dev
```

Abra `http://127.0.0.1:4173`. A porta pode ser alterada com `PORT=8080 npm run dev`. Sirva os módulos ES por HTTP.

Para hospedar o modo local, publique `index.html`, `manifest.json`, `src/`, `css/` e `assets/` no mesmo diretório. Configure o servidor para servir `.js` como JavaScript e retornar 404 em `/api/session`. As preferências e as fichas locais pertencem à origem do navegador: exporte o JSON antes de mudar domínio ou porta. Para autenticação e salvamento remoto, configure o ambiente, aplique a migração e execute `npm start`, conforme o [guia de configuração](docs/remote-sheets.md).

## Verificações

```sh
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

Em Linux sem dependências gráficas, use `npx playwright install --with-deps chromium`. O Playwright inicia um servidor estático na porta `4174` e guarda traces das falhas em `test-results/`. A porta de teste pode ser alterada com `E2E_PORT`. O CI executa as mesmas verificações em pushes para `dev`/`main` e em pull requests.

## Configuração de componentes

Dê **duplo clique no nome** de um atributo, recurso, perícia, resistência, defesa, iniciativa, proficiência, ataque, dano ou DT para abrir o editor desse componente. Com o nome focado, Enter ou Espaço abre o mesmo popup; no celular, use o botão ✎. Edite nível, XP e dados restantes diretamente nos respectivos campos.

O popup oferece **Padrão**, **Manual**, **Fórmula** e **Progressão por nível**, além de nome, prévia e parâmetros específicos. Opções avançadas guardam limites, regras de progressão, ajustes de combate e detalhamento do cálculo. Salvar confirma nome e configuração juntos. Cancelar ou Escape descarta o rascunho.

- `VALOR_PADRAO + MOD_INT` ajusta o cálculo original; uma expressão como `FOR * 2` substitui o cálculo base. Bônus temporários são aplicados uma vez depois da regra.
- O seletor **Usar outro valor** insere referências estáveis a outros componentes. Para recursos, há opções separadas para valor atual e máximo. Renomear não quebra referências; dependências circulares e exclusões de componentes referenciados são rejeitadas.
- Em recursos, **Não negativo** começa ativado. Desativar permite saldo atual negativo; o máximo continua maior ou igual a zero. Aumentar o máximo não recupera o recurso; reduzir o máximo limita o atual e recalcula os dependentes.
- Vida Máxima e HP compartilham a regra do recurso de vida. A DT de magias configura a conjuração global; cada magia também possui um popup contextual de DT, além do cadastro completo.
- Perícias das duas tabelas mantêm suas regras ao trocar a tabela visível. O cálculo padrão utiliza atributo, proficiência/expertise, bônus, buffs e maestria.

**Configurações** reúne criação e gestão de características personalizadas, exibidas em um bloco próprio da ficha. **Editar componentes** permite renomear em lote, ocultar e restaurar componentes. **Efeitos** mantém as ações explícitas de turno, rodada e descanso. Ocultar componentes preserva seus dados e cálculos.

## Personalização

Nomes de registros são gravados no cadastro; nomes estruturais são rótulos de apresentação. Os componentes utilizam IDs estáveis. O documento exportado inclui as configurações de aparência e cálculo.

## Formato e recuperação

O JSON exportado usa este envelope:

```json
{
  "formatVersion": 1,
  "character": { "schemaVersion": 5 },
  "sheetAppearance": {
    "version": 1,
    "components": {
      "resource:hp": {
        "label": "Vitalidade",
        "colors": { "dark": { "accent": "#aa3344" } }
      }
    },
    "layouts": { "desktop": {}, "mobile": {} }
  }
}
```

O exemplo omite os demais dados obrigatórios do personagem. Uma posição tem `{parent, x, y, w, h}`: `x`/`w` são percentuais da largura do contêiner; `y`/`h` usam pixels CSS. Seções ficam na raiz; campos podem ficar na raiz ou em uma seção. Mapas de layout vazios usam a disposição original.

Chaves de `localStorage`:

| Chave | Conteúdo |
| --- | --- |
| `hunterscodex:sheet:v1` | Documento atual, gravado em uma única operação |
| `hunterscodex:character:v1` | Ficha legada, preservada durante a migração |
| `hunterscodex:sheet:backup` | Conteúdo anterior à última migração ou substituição |
| `hunterscodex:preferences:v1` | Preferência de tema, excluída da exportação |

O schema atual do personagem é 5. A importação aplica as migrações de documentos legados e preserva campos desconhecidos do personagem. Documentos sem aparência recebem a configuração padrão. A validação verifica a versão do schema, os identificadores e os valores de aparência.

Em erro de carregamento, use as opções da tela para baixar o original, importar uma ficha recuperada ou tentar novamente. Para recuperação manual, salve o conteúdo da chave de backup como arquivo JSON e use **Importar ficha recuperada**. O arquivo é validado antes de substituir o documento. Mantenha exportações periódicas para guardar cópias das fichas fora do navegador.

O autosave local utiliza debounce de 500 ms. Uma falha mantém as alterações na memória e mostra **Erro ao salvar**; use **Fichas → Salvar ficha → Salvar como JSON** para recuperar a edição. O indicador **Salvo** confirma a gravação em `localStorage`. Consulte o [guia de fichas remotas](docs/remote-sheets.md#autosave) para os estados de salvamento da conta.
