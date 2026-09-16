# Hunter's Codex

Ficha de personagem em JavaScript com cálculos locais, importação/exportação JSON e editor de aparência. A aplicação é servida como arquivos estáticos; não requer backend, CDN ou build de produção.

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

## Personalização

O botão **Personalizar ficha** abre um rascunho isolado. A edição dos dados fica suspensa até Salvar ou Cancelar. Restaurar padrão altera somente o rascunho, inclusive os dois layouts, e pode ser cancelado. Uma falha de gravação mantém o editor e o rascunho abertos.

Selecione um componente na ficha ou no seletor. É possível alterar rótulo, cores por tema, seção, posição e tamanho. Campos de identidade, atributos, recursos, perícias, resistências, combate, maestria e campos individuais de equipamentos/registros mantêm seus IDs ao serem movidos. Os campos completos de entidades também estão acessíveis em **Editar campos** na visualização padrão.

- A alça superior move; a inferior redimensiona. Ambas aceitam mouse e toque.
- Com uma alça focada, as setas movem 1 px; Shift usa passos de 10 px. Alt + setas redimensiona. A alça inferior também redimensiona diretamente com as setas.
- Posição/tamanho podem ser informados numericamente. Movimentos que excedem limites, mínimos de conteúdo ou invadem um componente irmão são rejeitados.
- Computador e celular têm geometrias independentes; rótulos e cores são compartilhados. O perfil móvel é usado quando a área da ficha tem até 900 px.
- A ordem de leitura e foco segue as posições visuais. Crescimento de conteúdo desloca os componentes seguintes para baixo sem reescrever coordenadas salvas.
- Campos novos são acrescentados em espaço disponível; IDs não presentes na ficha são ignorados na renderização e preservados no documento.

O tema usa a preferência do sistema até a primeira escolha explícita. O botão mostra a ação disponível: sol para ativar o tema claro, lua para o escuro.

## Arquitetura

| Camada | Responsabilidade |
| --- | --- |
| `src/app` | Composição das dependências e inicialização |
| `src/domain` | Personagem, catálogos, campos de entidades e validação |
| `src/auto_calc_engine` | Fórmulas, combate, vitalidade, perícias e maestria; funções sem DOM ou persistência |
| `src/application` | Comandos, snapshots imutáveis, sincronização de derivados, transações e autosave |
| `src/application/ports` | Contratos dos repositórios |
| `src/customization` | Aparência versionada, validação e geometria sem DOM |
| `src/layout` | Renderização, acessibilidade, tema, registro de componentes e editor |
| `src/infrastructure` | Armazenamento do navegador, arquivos JSON e migrações |

O fluxo de alteração é `comando → draft privado → cálculos derivados → snapshot imutável → assinantes → autosave`. A interface recebe o snapshot e emite comandos; renderizar não altera o personagem. O autosave usa debounce de 500 ms e salva um snapshot capturado. Trocar de ficha cancela a gravação antiga somente após a nova gravação ter sido confirmada.

Para adicionar um cálculo, exporte uma função pura do motor e acrescente testes dos resultados. Para adicionar uma operação, implemente um comando e emita-o na interface. Para campos de armas, armaduras, buffs ou registros, o catálogo `ENTITY_FIELDS` define editor, conversão e validação; para outros componentes, registre ID, elemento, rótulo, seção padrão e largura mínima no registro visual. IDs nunca devem depender do rótulo ou do índice de uma lista.

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

O exemplo omite os demais dados obrigatórios do personagem. Uma posição tem `{parent, x, y, w, h}`: `x`/`w` são percentuais da largura do contêiner; `y`/`h` usam pixels CSS. Seções ficam na raiz; campos podem ficar na raiz ou em uma seção. Mapas de layout vazios usam a disposição original.

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
