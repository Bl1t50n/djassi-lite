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
