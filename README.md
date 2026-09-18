# Hunter's Codex

Ficha de personagem em JavaScript com cálculos locais, importação/exportação JSON, nomes e visibilidade de componentes personalizáveis, layout responsivo e tema claro/escuro. A aplicação é servida como arquivos estáticos; não requer backend, CDN ou build de produção.

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

## Uso da ficha

Edite os dados de identidade, atributos, recursos e regras diretamente na ficha. Armas, armaduras, buffs, poderes, magias e anotações continuam usando os respectivos modais de edição. Alterações recalculam os valores derivados e são salvas automaticamente.

Use **Editar componentes** para selecionar um componente existente e alterar seu nome exibido (de 1 a 120 caracteres). **Restaurar nome padrão** prepara o nome original; confirme em **Salvar nome**. Cancelar ou pressionar Escape descarta a edição. Os nomes são salvos automaticamente e incluídos na importação/exportação, sem modificar os dados ou cálculos do personagem.

Use **Remover componentes** para exibir os botões **×** na ficha. A remoção pede confirmação e retira o componente da tela; **Concluir remoção** encerra esse modo. Em **Editar componentes**, também é possível remover o item selecionado ou usar **Restaurar componente** nos itens marcados como removidos.

A remoção visual preserva valores e cálculos, é salva automaticamente e acompanha o JSON exportado. Restaurar uma seção mantém as remoções individuais dos seus campos. O botão de exclusão normal dos recursos personalizados continua apagando esses recursos da ficha.

O layout redistribui as colunas disponíveis e recolhe grupos vazios. Ao remover uma aba ativa, a próxima disponível é selecionada. Essa edição não permite arrastar, redimensionar ou alterar cores. Cores e posições de versões anteriores são preservadas no JSON por compatibilidade, mas não são aplicadas à interface.

O tema usa a preferência do sistema até a primeira escolha explícita. O botão mostra a ação disponível: sol para ativar o tema claro, lua para o escuro.

## Arquitetura

| Camada | Responsabilidade |
| --- | --- |
| `src/app` | Composição das dependências e inicialização |
| `src/domain` | Personagem, catálogos e validação dos nomes, visibilidade e aparência legada |
| `src/auto_calc_engine` | Fórmulas, combate, vitalidade, perícias e maestria; funções sem DOM ou persistência |
| `src/application` | Comandos, snapshots imutáveis, sincronização de derivados, transações e autosave |
| `src/application/ports` | Contratos dos repositórios |
| `src/layout` | Renderização da ficha, modais, acessibilidade e tema |
| `src/infrastructure` | Armazenamento do navegador, arquivos JSON e migrações |

O fluxo de alteração é `comando → draft privado → cálculos derivados → snapshot imutável → assinantes → autosave`. A interface recebe o snapshot e emite comandos; renderizar não altera o personagem. O autosave usa debounce de 500 ms e salva um snapshot capturado. Trocar de ficha cancela a gravação antiga somente após a nova gravação ter sido confirmada.

Para adicionar um cálculo, exporte uma função pura do motor e acrescente testes dos resultados. Para adicionar uma operação, implemente um comando e emita-o na interface. Migrações ficam na infraestrutura; o domínio mantém os contratos dos dados, incluindo nomes, visibilidade e aparência legada para compatibilidade.

## Formato e recuperação

O JSON exportado usa este envelope:

```json
{
  "formatVersion": 1,
  "character": { "schemaVersion": 2 },
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

O exemplo omite os demais dados obrigatórios do personagem. Uma posição tem `{parent, x, y, w, h}`: `x`/`w` são percentuais da largura do contêiner; `y`/`h` usam pixels CSS. Seções ficam na raiz; campos podem ficar na raiz ou em uma seção. Esses metadados de posição e as cores são preservados no JSON; a interface aplica nomes e visibilidade dos componentes existentes e redistribui a disposição responsiva. A propriedade opcional `hidden: true` em `sheetAppearance.components[id]` registra a remoção visual; sua ausência mantém o componente disponível.

Chaves de `localStorage`:

| Chave | Conteúdo |
| --- | --- |
| `hunterscodex:sheet:v1` | Documento atual, gravado em uma única operação |
| `hunterscodex:character:v1` | Ficha legada, preservada durante a migração |
| `hunterscodex:sheet:backup` | Conteúdo anterior à última migração ou substituição |
| `hunterscodex:preferences:v1` | Preferência de tema, excluída da exportação |

Fichas antigas recebem aparência padrão. Migrações não modificam a entrada e preservam campos desconhecidos do personagem. Versões futuras incompatíveis, identificadores inválidos e valores de aparência inseguros são rejeitados.

Em erro de carregamento, a tela permite baixar o original, importar uma ficha recuperada e tentar novamente. Uma ficha padrão nunca sobrescreve automaticamente um conteúdo ilegível. Para recuperação manual, salve o conteúdo da chave de backup como arquivo JSON e use **Importar ficha recuperada**. O arquivo é validado antes de substituir o documento. Exportações regulares continuam sendo a forma de guardar histórico fora do navegador.

Uma falha de autosave mantém as alterações na memória, mostra **Erro ao salvar** e permite exportá-las. O indicador só mostra **Salvo** quando `setItem` confirma a gravação. Alterações de tema continuam funcionando mesmo se a preferência não puder ser persistida.
