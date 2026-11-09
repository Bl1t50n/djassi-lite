import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { CliError } from "./errors.mjs";

// Ferramentas que são ficheiros .cmd/.bat no Windows. O Node não as arranca sem shell,
// por isso passam por cmd.exe. Por isso os argumentos destas são validados antes.
// Limite: lista fixa. git, python, dotnet, go, cargo e make são executáveis reais e
// recebem argv sem shell; se alguma passar a ser .cmd, acrescenta-a aqui.
const SHIMS = new Set(["npm", "pnpm", "yarn", "mvn", "gradle", "gradlew.bat"]);
const SAFE_ARG = /^[A-Za-z0-9_.:=/@+-]+$/;

export const usesShell = (tool) => process.platform === "win32" && SHIMS.has(tool);

// npm no Windows: corre o npm-cli.js que vem com o Node, sem o npm.cmd. Sem cmd.exe pelo meio,
// o Ctrl+C não pergunta "Terminate batch job (Y/N)?" e não é preciso shell.
// Limite: usa o npm instalado com o Node; um npm mais recente noutra pasta (npm i -g npm) é ignorado.
const NPM_CLI = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

// Devolve [comando, argumentos, shell] para o spawn. Com shell, uma linha única: o Node 24 avisa
// (DEP0190) quando recebe argumentos soltos com shell: true. É seguro porque os argumentos já
// passaram por checkArgs (só letras, números e . _ : = / @ + -, sem espaços nem caracteres do cmd).
export function spawnArgs(tool, args) {
  if (!usesShell(tool)) return [tool, args, false];
  checkArgs(tool, args);
  if (tool === "npm" && existsSync(NPM_CLI)) return [process.execPath, [NPM_CLI, ...args], false];
  return [[tool, ...args].join(" "), [], true];
}

export function checkArgs(tool, args) {
  if (!SHIMS.has(tool)) return;
  const bad = args.find((arg) => !SAFE_ARG.test(arg));
  if (bad !== undefined)
    throw new CliError(
      `Argumento não permitido: ${JSON.stringify(bad)}`,
      "Usa só letras, números e os caracteres . _ : = / @ + -"
    );
}

export function commandText(tool, args) {
  return [tool, ...args].map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(" ");
}

// Corre a ferramenta com o ecrã normal, mas guarda o fim do stderr para explicar o erro se falhar.
// stdin e stdout continuam ligados ao terminal (prompts e cores funcionam); só o stderr passa por nós.
// Devolve { code, stderr, interrupted }. interrupted = o utilizador carregou em Ctrl+C.
export function runTool(tool, args, { cwd } = {}) {
  const [command, argv, shell] = spawnArgs(tool, args);
  // O stderr deixa de ser um terminal para o filho; FORCE_COLOR mantém as cores quando o ecrã as mostra.
  const keepColor =
    process.stdout.isTTY && process.stderr.isTTY && !("NO_COLOR" in process.env) && !("FORCE_COLOR" in process.env);
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, {
      cwd,
      shell,
      stdio: ["inherit", "inherit", "pipe"],
      windowsHide: true,
      env: keepColor ? { ...process.env, FORCE_COLOR: "1" } : process.env
    });
    let tail = "";
    let interrupted = false;
    // Ctrl+C chega também ao filho: esperamos que ele termine em vez de sair primeiro.
    const onInterrupt = () => {
      interrupted = true;
    };
    process.on("SIGINT", onInterrupt);
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      tail = (tail + chunk.toString("utf8")).slice(-64 * 1024);
    });
    child.on("error", () => {
      process.off("SIGINT", onInterrupt);
      reject(new CliError(`Não consegui iniciar '${tool}'.`, "Vê o que falta com: djassi doctor"));
    });
    child.on("close", (code, signal) => {
      process.off("SIGINT", onInterrupt);
      resolve({ code: code ?? 1, stderr: tail, interrupted: interrupted || Boolean(signal) });
    });
  });
}

// Devolve a primeira linha da saída (ex.: a versão) ou null se a ferramenta não existe.
export function probe(tool, args = ["--version"]) {
  const [command, argv, shell] = spawnArgs(tool, args);
  const result = spawnSync(command, argv, {
    shell,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
    timeout: 15000
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim().split(/\r?\n/)[0] || "ok";
}
