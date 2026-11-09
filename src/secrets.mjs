import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { CliError } from "./errors.mjs";

// ponytail: padrões conhecidos, não é um scanner completo. Para o repo público, o gitleaks corre no CI.
const SAMPLE = /\.(example|sample|template)$/;
const SECRET_FILE = [/^\.env(\..+)?$/, /\.(pem|key|p12|pfx|jks|keystore)$/i, /^id_(rsa|dsa|ecdsa|ed25519)$/];
const SECRET_TEXT = [
  [/ghp_[A-Za-z0-9]{36}/, "token do GitHub"],
  [/github_pat_[A-Za-z0-9_]{22,}/, "token do GitHub"],
  [/AKIA[0-9A-Z]{16}/, "chave AWS"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "token do Slack"],
  [/sk_live_[A-Za-z0-9]{16,}/, "chave Stripe"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "chave privada"]
];

// Devolve o nome do ficheiro se parecer um segredo, senão null.
export function secretFileProblem(path) {
  const name = basename(path);
  if (SAMPLE.test(name)) return null;
  return SECRET_FILE.some((re) => re.test(name)) ? name : null;
}

export function checkStageFiles(paths) {
  const bad = paths.map(secretFileProblem).filter(Boolean);
  if (bad.length)
    throw new CliError(
      `Estes ficheiros parecem segredos: ${bad.join(", ")}`,
      "Põe-nos no .gitignore. Se forem exemplos, renomeia para .example."
    );
}

export function stagedNames(cwd) {
  const result = spawnSync("git", ["diff", "--cached", "--name-only"], { cwd, encoding: "utf8" });
  return result.stdout ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
}

// Só olha para as linhas que o commit acrescenta.
export function checkStagedContent(cwd) {
  const result = spawnSync("git", ["diff", "--cached", "-U0"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  const added = (result.stdout ?? "").split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  const hits = SECRET_TEXT.filter(([re]) => added.some((line) => re.test(line))).map(([, label]) => label);
  if (hits.length)
    throw new CliError(
      `O commit contém possíveis segredos: ${[...new Set(hits)].join(", ")}.`,
      "Tira-os do ficheiro (git diff --cached mostra onde estão) e volta a preparar."
    );
}
