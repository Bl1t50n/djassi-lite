import { BRAND } from "./brand.mjs";

// Erros comuns → o que aconteceu e o que fazer a seguir.
// ponytail: tabela fixa, sem IA nem rede. Ordem = prioridade (o mais específico primeiro; o primeiro que bate ganha).
// Para acrescentar um erro: uma entrada nova aqui e um caso em test/explain.test.mjs.
const cli = BRAND.command;
const WIN = process.platform === "win32";

const RULES = [
  {
    test: /EADDRINUSE|address already in use|port \d+ is (?:already )?in use|that port is already in use|already running on port/i,
    explain(text) {
      // O número depois do último ':' (":::3000", "127.0.0.1:5432"), ou "port 3000".
      const port = text.match(/EADDRINUSE[^\n]*:(\d{2,5})\b/i)?.[1] ?? text.match(/port\s+(\d{2,5})\b/i)?.[1];
      const free = WIN
        ? [`${cli} kill --port ${port ?? "<porta>"}`]
        : [`lsof -i :${port ?? "<porta>"}   (mostra o PID)`, "kill <PID>"];
      return {
        title: port ? `Porta ${port} ocupada` : "Porta ocupada",
        why: "Outro programa já está a usar esta porta. Muitas vezes é o teu próprio servidor, ainda aberto noutro terminal.",
        steps: [...free, "ou fecha o outro terminal onde o servidor está a correr"]
      };
    }
  },
  {
    test: /running scripts is disabled on this system|execução de scripts (?:foi desabilitada|está desativada)/i,
    explain: () => ({
      title: "O PowerShell bloqueou um script",
      why: "Por segurança, o PowerShell não corre ficheiros .ps1 (como o npm.ps1) por defeito.",
      steps: [
        `corre pelo ${cli} (${cli} dev, ${cli} run test): ele usa o npm.cmd, que não é bloqueado`,
        "ou escreve npm.cmd em vez de npm",
        "ou, se aceitares o risco, só para o teu utilizador: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned"
      ]
    })
  },
  {
    test: /is not recognized as an internal or external command|não é reconhecido como (?:um )?comando interno|command not found|The term '[^']+' is not recognized|spawn \S+ ENOENT/i,
    explain(text) {
      const name =
        text.match(/'([^']+)' (?:is not recognized|não é reconhecido)/i)?.[1] ??
        text.match(/The term '([^']+)'/i)?.[1] ??
        text.match(/([\w.-]+): command not found/i)?.[1] ??
        text.match(/spawn (\S+) ENOENT/i)?.[1];
      return {
        title: name ? `O terminal não encontra '${name}'` : "O terminal não encontra o programa",
        why: "O programa não está instalado, ou está instalado mas o terminal não sabe onde (falta no PATH).",
        steps: [`${cli} doctor   (diz o que falta e onde instalar)`, "depois de instalar, fecha e volta a abrir o terminal"]
      };
    }
  },
  {
    test: /Missing script:/i,
    explain(text) {
      const script = text.match(/Missing script:\s*"?([\w:.-]+)"?/i)?.[1];
      return {
        title: script ? `O package.json não tem o script '${script}'` : "Script em falta no package.json",
        why: "Pediste uma tarefa que não está em \"scripts\" no package.json.",
        steps: [`${cli} inspect   (mostra as tarefas que existem)`]
      };
    }
  },
  {
    test: /ENOENT[^\n]*package\.json|Could not read package\.json/i,
    explain: () => ({
      title: "Não há package.json nesta pasta",
      why: "Estás fora da pasta do projeto, ou numa pasta acima dela.",
      steps: [`${cli} inspect   (diz onde está o projeto)`, "entra na pasta certa: cd <pasta-do-projeto>"]
    })
  },
  {
    test: /SyntaxError: Cannot use import statement outside a module/,
    explain: () => ({
      title: "import num ficheiro que o Node trata como CommonJS",
      why: "O Node só aceita import em ficheiros .mjs ou quando o package.json diz \"type\": \"module\".",
      steps: ['acrescenta "type": "module" ao package.json', "ou muda a extensão para .mjs, ou usa require(...)"]
    })
  },
  {
    test: /Cannot find (?:module|package) '([^']+)'|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/,
    explain(text) {
      const name = text.match(/Cannot find (?:module|package) '([^']+)'/)?.[1];
      const local = name && /^(?:\.|\/|[A-Za-z]:[\\/])/.test(name);
      return local
        ? {
            title: "O ficheiro importado não existe",
            why: `Não existe nada em '${name}'. O caminho ou o nome estão errados.`,
            steps: ["confirma o nome e a pasta do ficheiro", "maiúsculas contam (no Linux e no deploy)", "em ESM, o import precisa da extensão: './util.js'"]
          }
        : {
            title: name ? `A dependência '${name}' não está instalada` : "Falta uma dependência",
            why: "O código usa um pacote que não está em node_modules.",
            steps: ["npm install   (ou pnpm install / yarn)", name ? `se continuar: npm install ${name}` : "confirma o nome do pacote"]
          };
    }
  },
  {
    test: /ModuleNotFoundError: No module named '([^']+)'/,
    explain(text) {
      const name = text.match(/No module named '([^']+)'/)[1].split(".")[0];
      return {
        title: `O Python não encontra o módulo '${name}'`,
        why: "O pacote não está instalado no Python que estás a usar.",
        steps: [
          "se usas um ambiente virtual (venv), ativa-o primeiro",
          `python -m pip install ${name}`,
          "às vezes o pacote tem outro nome (ex.: cv2 → opencv-python): procura 'pip install <módulo>'"
        ]
      };
    }
  },
  {
    test: /JAVA_HOME is not (?:set|defined)|JAVA_HOME environment variable is not defined/i,
    explain: () => ({
      title: "Falta o JAVA_HOME",
      why: "O Maven/Gradle não sabe onde está o Java (JDK).",
      steps: ["instala um JDK (ex.: https://adoptium.net)", "define JAVA_HOME com a pasta do JDK e volta a abrir o terminal"]
    })
  },
  {
    test: /Please tell me who you are|empty ident name|unable to auto-detect email address/i,
    explain: () => ({
      title: "O git não sabe quem és",
      why: "Cada commit leva um nome e um email, e ainda não os definiste.",
      steps: ['git config --global user.name "O teu nome"', 'git config --global user.email "o-teu@email.com"']
    })
  },
  {
    test: /not a git repository/i,
    explain: () => ({
      title: "Esta pasta não é um repositório git",
      why: "Ou estás na pasta errada, ou o projeto ainda não usa git.",
      steps: ["confirma que estás na pasta do projeto", "se é um projeto novo: git init"]
    })
  },
  {
    test: /No configured push destination|'origin' does not appear to be a git repository/i,
    explain: () => ({
      title: "O repositório não está ligado ao GitHub",
      why: "Não há nenhum remoto (origin) para onde enviar.",
      steps: ["cria o repositório no GitHub", "git remote add origin <url-do-repositório>", `${cli} push -u origin main`]
    })
  },
  {
    test: /has no upstream branch/i,
    explain(text) {
      const branch = text.match(/The current branch (\S+) has no upstream/i)?.[1] ?? "<ramo>";
      return {
        title: "Este ramo ainda não existe no GitHub",
        why: "É a primeira vez que envias este ramo: é preciso dizer para onde.",
        steps: [`${cli} push -u origin ${branch}`]
      };
    }
  },
  {
    test: /\[rejected\]|non-fast-forward|Updates were rejected because the remote contains work|\(fetch first\)/i,
    explain: () => ({
      title: "O GitHub tem commits que tu não tens",
      why: "Alguém (ou tu noutro computador) enviou commits antes de ti.",
      steps: [`${cli} pull`, `depois ${cli} push`]
    })
  },
  {
    test: /Not possible to fast-forward|have diverged|divergent branches/i,
    explain: () => ({
      title: "O teu ramo e o do GitHub seguiram caminhos diferentes",
      why: "Os dois lados têm commits novos. É preciso juntá-los.",
      steps: ["git pull --no-rebase   (junta os dois; pode dar conflitos)", "se der conflitos, o git diz em que ficheiros: resolve-os e faz commit"]
    })
  },
  {
    test: /would be overwritten by (?:merge|checkout)|Your local changes to the following files would be overwritten/i,
    explain: () => ({
      title: "Tens alterações por guardar que este comando ia apagar",
      why: "O git parou para não perderes trabalho.",
      steps: [`${cli} stage <ficheiros> e ${cli} commit -m "..."`, "ou põe-nas de lado: git stash (e depois git stash pop)"]
    })
  },
  {
    test: /CONFLICT \(|Automatic merge failed|Merge conflict in/i,
    explain: () => ({
      title: "Conflito de merge",
      why: "As duas versões mudaram as mesmas linhas e o git não sabe qual escolher.",
      steps: [
        "abre os ficheiros indicados e procura <<<<<<<, ======= e >>>>>>>",
        "deixa o código certo e apaga essas marcas",
        `${cli} stage <ficheiro> e ${cli} commit -m "Resolve conflito"`
      ]
    })
  },
  {
    test: /Permission denied \(publickey\)|Host key verification failed/i,
    explain: () => ({
      title: "O GitHub não reconhece a tua chave SSH",
      why: "O remoto usa SSH (git@github.com:...) e este computador não tem uma chave registada.",
      steps: [
        "mais simples: usa o endereço HTTPS (https://github.com/...)",
        "ou regista uma chave: https://docs.github.com/authentication/connecting-to-github-with-ssh"
      ]
    })
  },
  {
    test: /Authentication failed|Invalid username or (?:password|token)|Support for password authentication was removed/i,
    explain: () => ({
      title: "O GitHub recusou o login",
      why: "O GitHub já não aceita a palavra-passe da conta no terminal.",
      steps: [
        "no Windows, o Git Credential Manager (vem com o Git) abre o login no browser",
        "ou usa um token: https://docs.github.com/get-started/getting-started-with-git/caching-your-github-credentials-in-git"
      ]
    })
  },
  {
    test: /ERESOLVE|unable to resolve dependency tree/i,
    explain: () => ({
      title: "Dependências incompatíveis",
      why: "Dois pacotes pedem versões diferentes de um terceiro.",
      steps: [
        "lê a linha 'Could not resolve dependency' para ver qual",
        "atualiza o pacote que está mais antigo",
        "último recurso: npm install --legacy-peer-deps (pode partir coisas)"
      ]
    })
  },
  {
    test: /ECONNREFUSED|Connection refused/i,
    explain: () => ({
      title: "Ligação recusada",
      why: "Tentaste ligar a um servidor que não está a correr (ex.: a base de dados ou o teu backend).",
      steps: ["arranca esse servidor primeiro", WIN ? `confirma a porta: ${cli} ports` : "confirma a porta e o endereço na configuração"]
    })
  },
  {
    test: /EACCES|EPERM|EBUSY|Access is denied|Acesso negado|permission denied/i,
    explain: () => ({
      title: "Sem permissão (ou o ficheiro está em uso)",
      why: "O sistema não deixa ler ou escrever aqui. No Windows, muitas vezes é outro programa com o ficheiro aberto.",
      steps: [
        "fecha o editor, outro terminal ou o servidor que use essa pasta, e tenta outra vez",
        "não uses sudo com npm; se o Node precisa de admin, reinstala-o com o nvm"
      ]
    })
  },
  {
    test: /ENOENT|no such file or directory|cannot find the path specified|não pode encontrar o caminho/i,
    explain: () => ({
      title: "Ficheiro ou pasta não existe",
      why: "O caminho está errado, ou estás na pasta errada.",
      steps: [`confirma onde estás: ${cli} inspect`, "confirma o nome (maiúsculas, extensão)"]
    })
  },
  {
    test: /Cannot read propert(?:y|ies) of (?:undefined|null)/,
    explain(text) {
      const prop = text.match(/\(reading '([^']+)'\)/)?.[1];
      return {
        title: "Usaste uma variável vazia (undefined/null)",
        why: `Leste ${prop ? `'.${prop}'` : "uma propriedade"} de algo que ainda não tem valor.`,
        steps: ["o erro indica o ficheiro e a linha: vê essa linha", "faz console.log da variável antes dessa linha para ver o que tem"]
      };
    }
  },
  {
    test: /ReferenceError: [\w$]+ is not defined|NameError: name '\w+' is not defined/,
    explain(text) {
      const name = text.match(/ReferenceError: ([\w$]+)|NameError: name '(\w+)'/);
      return {
        title: `'${name?.[1] ?? name?.[2]}' não existe`,
        why: "Usas um nome antes de o criar, está mal escrito, ou falta o import.",
        steps: ["confirma a escrita (maiúsculas contam)", "confirma que foi declarado ou importado antes desta linha"]
      };
    }
  },
  {
    test: /IndentationError|TabError/,
    explain: () => ({
      title: "Indentação errada (Python)",
      why: "Em Python, os espaços no início da linha fazem parte do código.",
      steps: ["vê a linha indicada e a anterior", "não mistures tabs e espaços: configura o editor para 4 espaços"]
    })
  },
  {
    test: /SyntaxError|Unexpected token/,
    explain: () => ({
      title: "Erro de escrita no código",
      why: "Falta (ou sobra) um parêntese, chaveta, vírgula ou aspas.",
      steps: ["o erro indica o ficheiro e a linha: vê essa linha e a anterior"]
    })
  },
  {
    test: /HEAD detached|detached HEAD/i,
    explain: () => ({
      title: "Estás fora de qualquer ramo (detached HEAD)",
      why: "Foste para um commit antigo. Commits feitos aqui perdem-se facilmente.",
      steps: [`volta a um ramo: ${cli} switch main`, `se já fizeste commits aqui: ${cli} branch <nome-novo> para os guardar`]
    })
  },
  {
    test: /LF will be replaced by CRLF|CRLF will be replaced by LF/i,
    explain: () => ({
      title: "Só um aviso sobre fim de linha",
      why: "Windows e Linux terminam as linhas de forma diferente e o git ajusta isso sozinho.",
      steps: ["não precisas de fazer nada"]
    })
  }
];

// Devolve { title, why, steps } do primeiro erro conhecido, ou null.
export function explain(text) {
  if (!text) return null;
  const rule = RULES.find((r) => r.test.test(text));
  return rule ? rule.explain(text) : null;
}

export function renderExplanation(found) {
  return [`ℹ ${found.title}`, `  ${found.why}`, ...found.steps.map((step) => `  → ${step}`)];
}

// Depois de um comando falhar: explica se conhecer o erro, senão dá a dica geral.
export function explainFailure(stderr, code) {
  const found = explain(stderr);
  const lines = found
    ? renderExplanation(found)
    : [
        `ℹ O comando terminou com erro (código ${code}).`,
        "  Procura acima a primeira linha com 'Error' ou 'error': costuma dizer o ficheiro e a linha."
      ];
  console.error(["", ...lines].join("\n"));
}
