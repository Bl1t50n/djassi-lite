# djassi-lite

Mini CLI para estudantes de informática. Deteta o tipo de projeto, corre as tarefas certas, faz comandos Git com proteções e toca um som quando um comando termina.

É uma versão reduzida do DJASSI CLI (Cabral Djassi Studio). Não tem contas, cloud nem deploy.

## Instalar

Precisas de Node.js 22 ou mais recente, e de Git.

```bash
npm install -g github:Bl1t50n/djassi-lite
djassi --help
djassi doctor
```

## Comandos principais

| Comando | Para quê |
|---|---|
| `djassi inspect` | Mostra o tipo de projeto e as tarefas disponíveis |
| `djassi run test` | Corre uma tarefa (`test`, `build`, `lint`...) |
| `djassi dev` | Arranca o projeto |
| `djassi status` / `log` / `diff` | Vê o estado do repositório |
| `djassi stage README.md` | Prepara um ficheiro para o commit |
| `djassi commit -m "mensagem"` | Cria um commit |
| `djassi push -u origin <ramo>` | Envia o ramo atual |
| `djassi branch feat/nova-pagina` | Cria um ramo e muda para ele |

Qualquer comando com `--dry-run` mostra o comando real e não faz nada.

## Segurança

- Nunca usa `--force`, nem apaga ramos remotos, nem reescreve histórico.
- Não adiciona tudo de uma vez: `stage .` é recusado.
- Os programas são chamados sem shell. No Windows, `npm`, `pnpm`, `yarn`, `mvn` e `gradle` são ficheiros `.cmd`: os argumentos são validados e só aceitam letras, números e `. _ : = / @ + -`.

## Tipos de projeto reconhecidos

Node.js (npm, pnpm, yarn, bun), Python (incl. Django e `main.py`), Java (Maven e Gradle), .NET, Go, Rust e Makefile.

Se a pasta tiver vários projetos, o `djassi` pede `--project <pasta>` em vez de adivinhar.

## Limitações conhecidas

- Não há `run` para Java/Maven (usa o IDE ou `mvn` diretamente).
- Só reconhece o projeto na pasta indicada, não em subpastas (use `--project`).
- .NET, Go, Rust e Makefile: testado apenas na parte de deteção e comandos; não há cobertura de execução real nestes stacks.

## Sons

```bash
djassi sound set commit ./siuu.mp3
djassi sound list
djassi sound shell powershell   # opcional: sons nos comandos git do PowerShell
```

Os sons ficam em `~/.djassi/sounds.json` (ou em `DJASSI_CONFIG_DIR`). Usa `--no-sound` para os desligar num comando.

## Desenvolvimento

```bash
npm test
```

Os testes usam pastas temporárias e não tocam em áudio nem no teu perfil do PowerShell.

## Licença

MIT. Ver [LICENSE](LICENSE).

## Tarefas próprias (`djassi.json`)

Põe um `djassi.json` na raiz do projeto para adicionar tarefas. Cada tarefa é `[ferramenta, ...argumentos]`, sem shell:

```json
{ "tasks": { "seed": ["npm", "run", "db:seed"] } }
```

Depois corres `djassi run seed`. Aparece também em `djassi inspect`.

## Backend e frontend juntos

`djassi dev --all` arranca todos os projetos das pastas diretas (ex.: `backend/` e `frontend/`) em paralelo, com o nome de cada um à frente das linhas. Usa `--dry-run` para ver os comandos.

## Atualizações

`djassi update` diz se há versão nova. O CLI avisa no arranque, no máximo uma vez por dia. Nunca se instala sozinho: quem atualiza és tu. Desliga a verificação com `DJASSI_SKIP_UPDATE=1`.

## Segredos

`stage` recusa ficheiros como `.env`, `*.pem` e `id_rsa`. `commit` recusa tokens conhecidos (GitHub, AWS, Slack, Stripe) e chaves privadas no diff. Isto não substitui um scanner completo: usa também o `.gitignore` e um scanner no CI.

## Criar a tua versão

O CLI é open source (MIT). Para uma versão com o teu nome:

1. Muda `BRAND` em `src/brand.mjs` (comando, marca, repositório e banner).
2. Muda `name`, `bin` e `repository` no `package.json`.
3. Publica o pacote com o novo nome.

Os textos de erro ainda dizem `djassi`: uma pesquisa e substituição resolve.
