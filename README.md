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
| `djassi` | Diz onde estás e o que podes fazer a seguir |
| `djassi explain "erro"` | Explica um erro e diz o que fazer |
| `djassi status` / `log` / `diff` | Vê o estado do repositório |
| `djassi stage README.md` | Prepara um ficheiro para o commit |
| `djassi commit -m "mensagem"` | Cria um commit |
| `djassi push -u origin <ramo>` | Envia o ramo atual |
| `djassi branch feat/nova-pagina` | Cria um ramo e muda para ele |

Qualquer comando com `--dry-run` mostra o comando real e não faz nada.

## Quando algo corre mal

Se um comando corrido pelo `djassi` falha, o erro original aparece como sempre e, por baixo, a explicação:

```
Error: listen EADDRINUSE: address already in use :::3000
ℹ Porta 3000 ocupada
  Outro programa já está a usar esta porta. Muitas vezes é o teu próprio servidor, ainda aberto noutro terminal.
  → djassi kill --port 3000
```

Reconhece cerca de 30 erros comuns: portas ocupadas, programas que faltam, dependências por instalar, erros de git (push recusado, conflitos, login no GitHub), PowerShell a bloquear o npm, e erros de escrita em JavaScript e Python. Não usa IA nem internet: é uma tabela em `src/explain.mjs`.

Para erros de outros comandos:

```bash
djassi explain "fatal: The current branch feat/login has no upstream branch."
npm run build 2>&1 | djassi explain
```

O `djassi doctor` também avisa se um `.env` ou uma chave na raiz do projeto não está no `.gitignore`, ou se já foi commitado.

## Segurança

- Nunca usa `--force`, nem apaga ramos remotos, nem reescreve histórico.
- Não adiciona tudo de uma vez: `stage .` é recusado.
- Os programas são chamados sem shell. No Windows, `npm`, `pnpm`, `yarn`, `mvn` e `gradle` são ficheiros `.cmd`: os argumentos são validados e só aceitam letras, números e `. _ : = / @ + -`.

## Tipos de projeto reconhecidos

Node.js (npm, pnpm, yarn, bun), Python (incl. Django e `main.py`), Java (Maven e Gradle), .NET, Go, Rust e Makefile.

Se a pasta tiver vários projetos, o `djassi` pede `--project <pasta>` em vez de adivinhar.

## Limitações conhecidas

- Não há `run` para Java/Maven (usa o IDE ou `mvn` diretamente).
- `dev`, `run` e `inspect` só reconhecem o projeto na pasta indicada (usa `--project`). `dev --all` olha também para as pastas diretas.
- `ports`, `ram` e `kill` só existem no Windows.
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

`djassi dev --all` arranca os projetos que estão nas pastas diretas da pasta atual, todos ao mesmo tempo. Cada linha de saída vem com o nome da pasta à frente, por exemplo `[backend] ...` ou `[frontend] ...`.

Estrutura que funciona:

```
meu-projeto/
  backend/     package.json com script "dev"   ← incluído
  frontend/    package.json com script "dev"   ← incluído
  docs/        sem projeto                     ← ignorado
  .git/        oculta                          ← ignorada
```

Regras:

- Só olha para as pastas diretas. Não procura em `backend/src/` nem mais fundo.
- Pastas ocultas (`.nome`) e `node_modules` são ignoradas.
- Uma pasta entra se tiver um projeto reconhecido (ver lista acima) **e** uma tarefa `dev` (ou `start:dev`, `serve`, `start` em Node).
- Pastas sem tarefa `dev` ficam de fora sem aviso. Se nenhuma tiver, o comando termina com erro.
- Só existe para `dev`. Para `test` ou `build`, corre `djassi run <tarefa>` dentro de cada pasta.
- `--dry-run` mostra os comandos sem arrancar nada.

Para ver o que vai ser incluído antes de arrancar:

```bash
djassi dev --all --dry-run
```

Se o `djassi` não encontrar um projeto, confirma o formato com `djassi inspect --project backend`.

## Sistema (Windows)

| Comando | Para quê |
|---|---|
| `djassi ports` | Portas em escuta e o processo dono de cada uma |
| `djassi ram` | Os 15 processos que mais memória usam, e o total por tipo |
| `djassi kill 1234` | Para o processo com esse PID (pede confirmação; `--yes` salta) |
| `djassi kill --port 3000` | Para o processo que está nessa porta |

Tipos de processo:

- `system`: está na pasta do Windows. O `kill` recusa-o.
- `app`: outro programa.
- `admin`: o Windows nega o acesso a este terminal. Abre o terminal como administrador.
- `protected`: nem como administrador se abre (ex.: antivírus). O `kill` recusa-o.

Sem `--force`, o `kill` pede ao programa para fechar. Com `--force`, termina-o à força.

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
