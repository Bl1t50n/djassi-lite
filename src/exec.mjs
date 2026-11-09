import { spawnSync } from "node:child_process";
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

export function runTool(tool, args, { cwd } = {}) {
  if (usesShell(tool)) checkArgs(tool, args);
  const result = spawnSync(tool, args, {
    cwd,
    shell: usesShell(tool),
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error)
    throw new CliError(`Não consegui iniciar '${tool}'.`, "Vê o que falta com: djassi doctor");
  return result.status ?? 1;
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
