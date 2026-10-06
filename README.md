# Hunter's Codex

Ficha de personagem em JavaScript com cálculos locais, importação/exportação JSON e editor de aparência. A aplicação é servida como arquivos estáticos; não requer backend, CDN ou build de produçã,,,3o.

## Desenvolvimento

Use Node.js 24 e npm:

```sh
npm ci
npm run dev
```

Abra `http://127.0.0.1:4173`. A porta pode ser alterada com `PORT=8080 npm run dev`. Módulos ES requerem HTTP; abrir `index.html` via `file://` não é suportado.

Para hospedar, publique `index.html`, `manifest.json`, `src/`, `css/` e `assets/` no mesmo diretório. O servidor precisa servir `.js` como JavaScript. As preferências e a ficha pertencem à origem do navegador: exporte o JSON antes de mudar domínio ou porta. Não há service worker nem sincronização em nuvem.

## Verificações

```sh
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

Em Linux sem dependências gráficas, use `npx playwright install --with-deps chromium`. O Playwright inicia o servidor estático automaticamente e guarda traces das falhas em `test-results/`. O CI executa as mesmas verificações em pushes para `dev`/`main` e em pull requests.

## Configuração de componentes

Dê **duplo clique no nome** de um atributo, recurso, perícia, resistência, defesa, iniciativa, proficiência, ataque, dano ou DT para abrir o editor desse componente. Com o nome focado, Enter ou Espaço abre o mesmo popup; no celular, use o botão ✎. Valores como nível, XP e dados restantes continuam sendo dados de entrada editáveis.

O popup oferece **Padrão**, **Manual**, **Fórmula** e **Progressão por nível**, além de nome, prévia e parâmetros específicos. Opções avançadas guardam limites, regras de progressão, ajustes de combate e detalhamento do cálculo. Salvar confirma nome e configuração juntos. Cancelar ou Escape descarta o rascunho.

- `VALOR_PADRAO + MOD_INT` ajusta o cálculo original; uma expressão como `FOR * 2` substitui o cálculo base. Bônus temporários são aplicados uma vez depois da regra.
- O seletor **Usar outro valor** insere referências estáveis a outros componentes. Para recursos, há opções separadas para valor atual e máximo. Renomear não quebra referências; dependências circulares e exclusões de componentes referenciados são rejeitadas.
- Em recursos, **Não negativo** começa ativado. Desativar permite saldo atual negativo; o máximo continua maior ou igual a zero. Aumentar o máximo não recupera o recurso; reduzir o máximo limita o atual e recalcula os dependentes.
- Vida Máxima e HP compartilham a regra do recurso de vida. A DT de magias configura a conjuração global; cada magia também possui um popup contextual de DT, além do cadastro completo.
- Perícias das duas tabelas mantêm suas regras ao trocar a tabela visível. O cálculo padrão continua usando atributo, proficiência/expertise, bônus, buffs e maestria.

**Configurações** reúne criação e gestão de características personalizadas, exibidas em um bloco próprio da ficha. **Editar componentes** permite renomear em lote, ocultar e restaurar componentes. **Efeitos** mantém as ações explícitas de turno, rodada e descanso. Ocultar componentes preserva seus dados e cálculos.

## Personalização

Nomes de registros são gravados no cadastro; nomes estruturais são rótulos de apresentação. IDs não dependem dos nomes ou da posição em uma lista. Cores e layouts de documentos antigos são preservados para compatibilidade, sem alterar os cálculos.

## Arquitetura

| Camada | Responsabilidade |
| --- | --- |
| `src/app` | Composição das dependências e inicialização |
| `src/domain` | Personagem, catálogos, campos de entidades e validação |
| `src/auto_calc_engine` | Fórmulas, combate, vitalidade, perícias e maestria; funções sem DOM ou persistência |
| `src/application` | Comandos, snapshots imutáveis, sincronização de derivados, transações e autosave |
| `src/application/ports` | Contratos dos repositórios |
| `src/layout` | Renderização, acessibilidade, tema, registro de componentes e editor |
| `src/infrastructure` | Armazenamento do navegador, arquivos JSON e migrações |

O fluxo de alteração é `comando → draft privado → cálculos derivados → snapshot imutável → assinantes → autosave`. A interface recebe o snapshot e emite comandos; renderizar não altera o personagem. O autosave usa debounce de 500 ms e salva um snapshot capturado. Trocar de ficha cancela a gravação antiga somente após a nova gravação ter sido confirmada.

O registro em `src/domain/calculableComponents.js` descreve parâmetros e capacidades de cada tipo; `src/auto_calc_engine/defaultCalculations.js` reúne cálculos padrão que recebem um resolvedor de dependências. A prévia e a gravação usam a mesma transação em `src/application/componentConfiguration.js`. Para adicionar um cálculo, registre seu alvo, descritor e cálculo padrão e acrescente testes dos resultados. O formulário é gerado pelos metadados do registro. Para adicionar uma operação, implemente um comando e emita-o na interface. Para campos de armas, armaduras, buffs ou registros, o catálogo `ENTITY_FIELDS` define editor, conversão e validação; para outros componentes, registre ID, elemento, rótulo, seção padrão e largura mínima no registro visual. IDs nunca devem depender do rótulo ou do índice de uma lista.

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

O schema atual do personagem é 5; a versão 4 permanece reservada às fichas do antigo seletor de sistemas e mantém sua rotina de recuperação. Fichas antigas recebem aparência padrão. Migrações não modificam a entrada e preservam campos desconhecidos do personagem. Versões futuras incompatíveis, identificadores inválidos e valores de aparência inseguros são rejeitados.

Em erro de carregamento, a tela permite baixar o original, importar uma ficha recuperada e tentar novamente. Uma ficha padrão nunca sobrescreve automaticamente um conteúdo ilegível. Para recuperação manual, salve o conteúdo da chave de backup como arquivo JSON e use **Importar ficha recuperada**. O arquivo é validado antes de substituir o documento. Exportações regulares continuam sendo a forma de guardar histórico fora do navegador.

Uma falha de autosave mantém as alterações na memória, mostra **Erro ao salvar** e permite exportá-las. O indicador só mostra **Salvo** quando `setItem` confirma a gravação. Alterações de tema continuam funcionando mesmo se a preferência não puder ser persistida.
