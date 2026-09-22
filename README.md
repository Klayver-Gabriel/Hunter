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

Use o menu lateral para abrir uma página por vez: **Visão geral**, **Combate**, **Equipamento**, **Registros** e **Efeitos**. Em **Equipamento**, alterne entre equipamento e buffs, arsenal e biblioteca; em **Registros**, entre poderes, magias e diário. O botão de engrenagem **Configurações**, na parte inferior do menu, reúne fórmulas, progressões, conjuração e ajustes de combate. Em telas estreitas, o menu mantém apenas os ícones.

A página selecionada fica no endereço (`#equipment`, `#calculations`, etc.) e é mantida ao recarregar. Voltar e avançar no navegador percorrem as páginas visitadas. Trocar de página não altera os dados da ficha. Use Tab ou as setas para navegar pelo menu e Enter para abrir a área selecionada; **Ir para o conteúdo** leva ao título da página atual.

Edite os dados de identidade, atributos, recursos e regras diretamente na ficha. Armas, armaduras, buffs, poderes, magias e anotações continuam usando os respectivos modais de edição. Alterações recalculam os valores derivados e são salvas automaticamente.

Use **Editar componentes** para abrir a central de personalização. Navegue pelas dez categorias, busque pelo nome original ou personalizado e use os filtros **Todos**, **Alterados** e **Ocultos**. Cada linha mostra o nome original, o campo editável e o tipo: **Rótulo estrutural** ou **Nome de registro**. Você pode editar várias linhas, alternar categorias e só então escolher **Aplicar alterações**. Cancelar ou Escape descarta o lote inteiro. **Restaurar** restaura o nome e a visibilidade da linha; **Restaurar categoria** faz isso para todos os componentes da categoria, inclusive os filtrados. Em **Todas**, restaura todas as categorias.

Rótulos estruturais continuam em `sheetAppearance.components`. Nomes de armas, armaduras, poderes, magias, anotações, buffs, recursos personalizados e características numéricas são gravados nos próprios cadastros. O primeiro nome conhecido é guardado como `originalName` quando necessário para restauração. Identificadores, referências de equipamento e regras não mudam. Nomes antigos que estavam em sobrescritas visuais de registros migram para o cadastro, preservando cores e visibilidade. Não é possível recuperar um nome anterior que nunca tenha sido salvo.

Use **Remover componentes** para exibir os botões **×** na ficha. A remoção pede confirmação e oculta o componente; **Concluir remoção** encerra esse modo. Na central, o filtro **Ocultos** permite desmarcar **Oculto** e aplicar a restauração. Isso preserva dados e cálculos. Excluir um recurso personalizado continua removendo seus dados, mas a operação é bloqueada enquanto houver uma fórmula ou efeito que o referencie.

O layout redistribui as colunas disponíveis e recolhe grupos vazios. Ao remover uma aba ativa, a próxima disponível é selecionada. Essa edição não permite arrastar, redimensionar ou alterar cores. Cores e posições de versões anteriores são preservadas no JSON por compatibilidade, mas não são aplicadas à interface.

O tema usa a preferência do sistema até a primeira escolha explícita. O botão mostra a ação disponível: sol para ativar o tema claro, lua para o escuro.

## Características, fórmulas e progressão

Abra **Configurações** no menu lateral. Em **Características e fórmulas**, clique em **Configurar** junto à DT, a um atributo, recurso ou característica personalizada. **+ Característica** cria um valor numérico independente; seu nome é editável pela central. Todos têm três modos: **Manual**, **Fórmula direta** e **Progressão por nível**. Atributos existentes permanecem manuais por padrão. Na progressão, informe o valor/fórmula inicial, o ganho por nível seguinte e bônus no formato `nível|fórmula`, um por linha. Limites mínimo e máximo são opcionais e limitam o valor base; bônus temporais compõem o valor efetivo depois. Máximos de recursos nunca ficam negativos. Valores fracionários são preservados; use `floor`, `ceil` ou `round` quando precisar arredondar.

O seletor **Variável para inserir** usa nomes amigáveis atualizados. Selecione um campo de fórmula e clique em **Inserir variável**. As referências gravadas são estáveis e não dependem do nome exibido. Referências `REF_…` identificam outros máximos, a DT global e características personalizadas. Fórmulas aceitam `+`, `-`, `*`, `/`, parênteses, `floor`, `ceil`, `round`, `abs`, `min` e `max`. Não executam JavaScript.

| Variável | Significado nas novas regras |
| --- | --- |
| `FOR`, `DES`, `CON`, `INT`, `SAB`, `CAR` | Valor efetivo do atributo |
| `MOD_FOR`, `MOD_DES`, `MOD_CON`, `MOD_INT`, `MOD_SAB`, `MOD_CAR` | Modificador do atributo efetivo |
| `NIVEL` / `NIVEL_FINAL` | Nível final do personagem (1 a 20) |
| `NIVEL_AVALIADO` | Nível cuja parcela está sendo calculada; fora da progressão, o nível final |
| `PROFICIENCIA` | Proficiência calculada pelo nível final |
| `MOD_CONJURACAO` | Modificador do atributo de conjuração selecionado |
| `BONUS_DT` | Bônus configurado na conjuração global |
| `CIRCULO` | Círculo numérico, disponível na fórmula própria de uma magia |
| `BONUS_MAGIA` | Bônus específico, disponível na fórmula própria de uma magia |

Exemplo de mana: inicial `10 + MOD_INT`, ganho `3 + MOD_INT`, bônus `5|5`. Com Inteligência 14 no nível 5, a política de recalcular resulta em `12 + 5 + 5 + 5 + 5 + 5 = 37`. O ganho é avaliado individualmente: inicial `10` e ganho `NIVEL_AVALIADO` no nível 4 produzem `10 + 2 + 3 + 4 = 19`.

As políticas de retroatividade são:

- **Recalcular usando atributos atuais:** reavalia todas as parcelas ao mudar atributos, nível ou dependências.
- **Preservar ganhos registrados:** ao ativar, guarda o valor base atual e o nível como ponto inicial, sem fabricar ganhos anteriores. Ao subir, registra cada novo ganho e os bônus daquele nível. Reduzir nível retira da soma os ganhos acima dele, mas conserva os registros; recuperar esses níveis reutiliza os mesmos valores. Abaixo do ponto inicial, mantém seu valor porque não há histórico para desfazê-lo. Salvar a mesma regra mantém o histórico; alterar sua configuração estabelece um novo ponto inicial com o valor atual.

Aumentar um máximo não recupera o recurso atual. Reduzir o máximo limita o atual ao novo teto. O valor base manual é persistido separadamente (`baseMax`) para que bônus temporários não se tornem permanentes.

Variáveis desconhecidas, referências removidas, sintaxe inválida, divisão por zero, resultados não finitos e ciclos bloqueiam o salvamento. Ganhos de progressão são validados nos níveis 2–20, inclusive bônus futuros. Dependências são calculadas antes de quem as utiliza. Se uma alteração de atributo causar um erro numa regra já salva, o erro aparece junto à característica e o resultado fica indisponível. O último máximo persistido é mantido para preservar os dados, sem ser exibido como resultado válido. A ficha salva continua abrindo com esse erro para permitir correção. Importações são validadas estritamente: corrija resultados indisponíveis antes de exportar uma cópia para reimportação. Corrija a fórmula ou a dependência.

### Compatibilidade da vida

HP permanece em **Vida legada (compatibilidade)** até uma conversão explícita. As fórmulas em **Ajustar componentes de combate** continuam usando `CON`/`CON_MOD` como modificador, e `LEVEL`/`NIVEL` como nível final. Elas continuam arredondadas para baixo e o ganho seguinte é multiplicado por `nível − 1`, preservando os resultados antigos inclusive quando a fórmula depende do nível. Escolher um dos novos modos em **Configurar HP** converte explicitamente o recurso; nas novas regras, `CON` passa a ser valor e `MOD_CON` é o modificador. **Vida legada** permite voltar às fórmulas antigas, que são preservadas.

### DT de magias

Abra **Configurar conjuração global** para selecionar atributo, modo de cálculo, fórmula, bônus e consultar as parcelas da prévia. A fórmula inicial é:

```text
8 + PROFICIENCIA + MOD_CONJURACAO + BONUS_DT
```

Uma alternativa é `10 + floor(NIVEL / 2) + MOD_CONJURACAO + BONUS_DT`. A DT global também pode ser manual ou seguir progressão. Em fórmulas, inclua `BONUS_DT` para usar o bônus global; no modo manual, informe o resultado base desejado diretamente.

No cadastro da magia, escolha **Herdar DT global**, **Usar fórmula própria**, **Usar DT fixa** ou **Não utilizar DT**. Selecione a resistência quando houver e o bônus específico. Nos modos global e fixo, o bônus específico soma automaticamente. Na fórmula própria, inclua `BONUS_MAGIA`, por exemplo `8 + PROFICIENCIA + MOD_CONJURACAO + BONUS_DT + CIRCULO + BONUS_MAGIA`. A DT e a resistência aparecem no cartão e acompanham mudanças nas dependências.

**Círculo / Nível (texto original)** preserva descrições como “Truque / especial”. **Círculo numérico** é independente: deve ser informado para usar `CIRCULO`, e nunca é inferido como zero a partir de texto. Na migração, um texto composto apenas por dígitos pode fornecer o círculo numérico. Magias antigas começam sem DT e sem resistência exigida; novas magias criadas pela interface começam herdando a DT global, com resistência ainda opcional.

## Efeitos temporais

Em **Efeitos temporais**, use **+ Efeito temporal** para cadastrar recuperação/consumo ou bônus. Quantidades negativas consomem recurso ou reduzem uma característica. Exemplos:

- Recuperar 2 de mana: tipo recurso, alvo mana, quantidade `2`, evento **Avançar rodada**.
- Receber +2 de Força por três turnos: tipo bônus, alvo Força, quantidade `2`, unidade **Turnos**, duração `3`.
- Recuperar um recurso no descanso: tipo recurso, quantidade desejada, evento **Aplicar descanso**, duração **Sem prazo**.

**Avançar turno**, **Avançar rodada** e **Aplicar descanso** são ações independentes. Cada clique é um novo evento: soma simultaneamente as recuperações/consumos dos efeitos ativos, limita o atual entre zero e o máximo do início do evento e só então diminui durações da unidade correspondente. Se um bônus de máximo expirar, o atual é limitado novamente. Turno não avança rodada; descanso não reduz durações. Bônus de característica compõem o valor efetivo imediatamente enquanto ativos, sem sobrescrever a base. Efeitos expiram em zero; é possível desativar, reativar ou remover. Reativar um efeito inativo reinicia a duração; ativar um já ativo não a reinicia. Editar um efeito reinicia a duração escolhida.

Contadores e efeitos são persistidos. Reabrir, renderizar, recalcular, importar ou exportar não dispara eventos. O sistema não usa relógio real nem automatiza outras regras de descanso.

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
  "character": { "schemaVersion": 3 },
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

O schema 3 acrescenta `calculations` (regras, características e conjuração), `temporal` (contadores e efeitos), `dt`/`circle` nas magias e históricos de progressão. O envelope permanece na versão 1. A migração 2 → 3 mantém a vida legada e inicia contadores vazios, sem criar um histórico de evoluções anteriores. Configurações, nomes originais conhecidos, históricos e efeitos sobrevivem ao JSON. Fichas antigas sem aparência recebem aparência padrão. Migrações não modificam a entrada e preservam campos desconhecidos do personagem. Versões futuras incompatíveis, identificadores inválidos e valores de aparência inseguros são rejeitados.

Em erro de carregamento, a tela permite baixar o original, importar uma ficha recuperada e tentar novamente. Uma ficha padrão nunca sobrescreve automaticamente um conteúdo ilegível. Para recuperação manual, salve o conteúdo da chave de backup como arquivo JSON e use **Importar ficha recuperada**. O arquivo é validado antes de substituir o documento. Exportações regulares continuam sendo a forma de guardar histórico fora do navegador.

Uma falha de autosave mantém as alterações na memória, mostra **Erro ao salvar** e permite exportá-las. O indicador só mostra **Salvo** quando `setItem` confirma a gravação. Alterações de tema continuam funcionando mesmo se a preferência não puder ser persistida.
