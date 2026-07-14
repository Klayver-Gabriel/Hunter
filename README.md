# Hunter's Codex

Ficha de personagem digital com identidade visual de **software oficial da Guilda de Caçadores** — não uma "skin" de Monster Hunter, mas uma interface que parece pertencer àquele mundo.

100% HTML, CSS e JavaScript puro. Sem frameworks, sem build, sem servidor.

## Como usar

Extraia a pasta e abra `index.html` no navegador. Só isso. Tudo é salvo automaticamente no seu navegador (localStorage) — feche e volte quando quiser, a ficha continua lá.

Nenhum dado sai do seu computador a menos que você clique em **Exportar JSON**.

## O que já funciona (Fase 1)

- **Guild Card**: nome, classe, subclasse, raça, antecedente, alinhamento, XP, nível, guilda e rank — com o Selo da Guilda mudando de cor conforme o rank (Low Rank / High Rank / Master Rank / Monster Hunter).
- **Atributos** (FOR/DES/CON/INT/SAB/CAR) com modificador calculado automaticamente (`floor((score-10)/2)`, regra padrão de D&D 5e).
- **Recursos**: HP, ATP, Sanidade, EVO — cada um com barra visual, valores atual/máximo editáveis. Você pode adicionar recursos customizados (ex: "Insanidade", "Fúria") e removê-los.
- **Poderes, Magias e Diário**: três abas com cards. Clique em um card para editar, ou em "+ Novo" para criar. Tudo abre em modal, sem poluir a tela principal.
- **Autosave**: qualquer edição é salva ~0,5s depois de parar de digitar (indicador no canto inferior direito).
- **Exportar / Importar JSON**: backup completo da ficha, ou compartilhar com o mestre/grupo.
- **Novo Caçador**: reseta a ficha (a anterior continua no localStorage até ser sobrescrita — exporte antes se quiser guardar).
- Alternância rápida entre tema **Guilda** (escuro) e **Pergaminho** (claro).

## Estrutura do projeto

```
HunterCodex/
├── index.html              # esqueleto da interface
├── manifest.json           # metadados (base para PWA na Fase 5)
├── css/
│   ├── themes.css          # tokens de design: cores, fontes, espaçamento
│   ├── style.css           # reset e estilos base
│   ├── layout.css          # grid/estrutura da página
│   ├── components.css      # botões, tiles, barras, selo, tabs, cards
│   ├── modal.css           # o modal genérico
│   └── animations.css      # transições e entrada de elementos
├── js/
│   ├── formulaEngine.js    # matemática pura (modificadores, %, clamp)
│   ├── character.js        # formato de dados do personagem + helpers
│   ├── storage.js          # localStorage, autosave, export/import JSON
│   ├── modal.js             # modal genérico reaproveitado por poderes/magias/diário
│   ├── ui.js                # liga o objeto `character` ao DOM
│   └── app.js                # boot: carrega ficha salva e inicializa tudo
└── assets/                  # texturas, ícones, bordas, monstros, sons (reservado)
```

### Por que scripts simples em vez de ES Modules?

De propósito. `<script type="module">` é bloqueado por CORS quando a página é aberta direto do disco (`file://`) na maioria dos navegadores — quebraria a promessa de "só abrir o index.html". Por isso cada arquivo se registra em um namespace global (`window.HC`), carregado em ordem de dependência no fim do `<body>`.

### Convenção de dados

O personagem é um único objeto JS (veja `HC.character.createDefault()`). Campos do Guild Card usam `data-field="info.nome.do.campo"` no HTML — `ui.js` lê/escreve neles genericamente via `HC.character.get/set`, então adicionar um campo novo no futuro não exige tocar em `ui.js`.

## Roteiro (próximas fases, já planejadas na estrutura de dados)

O objeto do personagem já reserva `equipment` e `library`, e a pasta `js/` já prevê os arquivos que essas fases vão preencher:

- **Fase 2 — Equipamentos inteligentes**: `equipment.js` — armas, armaduras por peça, joias, talismãs, buffs automáticos.
- **Fase 3 — Damage Engine**: expande `formulaEngine.js` — fórmulas editáveis, breakdown do dano (base + força + encantamento + buffs + comida + skill + consumível), motion value, sharpness, afinidade, crítico, elemento.
- **Fase 4 — Biblioteca**: `equipment.js` + `inventory.js` — cadastro reutilizável de armas/armaduras/poderes/monstros, separado da ficha, exportável.
- **Fase 5 — Polimento**: sons opcionais, PWA instalável (o `manifest.json` já está pronto para isso), exportação em PDF, mais responsividade.

Cada fase pode ser pedida separadamente e vai se encaixar nessa base sem precisar reescrever o que já existe.
