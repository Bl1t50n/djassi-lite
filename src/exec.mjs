import { spawn, spawnSync } from "node:child_process";
import { CliError } from "./errors.mjs";

// Ferramentas que são ficheiros .cmd/.bat no Windows. O Node não as arranca sem shell,
// por isso passam por cmd.exe. Por isso os argumentos destas são validados antes.
// ponytail: lista fixa. git, python, dotnet, go, cargo e make são executáveis reais e
// recebem argv sem shell; se alguma passar a ser .cmd, acrescenta-a aqui.
const SHIMS = new Set(["npm", "pnpm", "yarn", "mvn", "gradle", "gradlew.bat"]);
const SAFE_ARG = /^[A-Za-z0-9_.:=/@+-]+$/;

export const usesShell = (tool) => process.platform === "win32" && SHIMS.has(tool);

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
  if (usesShell(tool)) checkArgs(tool, args);
  // O stderr deixa de ser um terminal para o filho; FORCE_COLOR mantém as cores quando o ecrã as mostra.
  const keepColor =
    process.stdout.isTTY && process.stderr.isTTY && !("NO_COLOR" in process.env) && !("FORCE_COLOR" in process.env);
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, {
      cwd,
      shell: usesShell(tool),
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
  const result = spawnSync(tool, args, {
    shell: usesShell(tool),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
    timeout: 15000
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim().split(/\r?\n/)[0] || "ok";
}
