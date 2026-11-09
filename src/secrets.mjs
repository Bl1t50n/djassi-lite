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

// Corre git e falha fechado: se não der para ler o diff, o commit não avança sem verificação.
function gitOutput(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0)
    throw new CliError(
      "Não consegui verificar o que vai no commit.",
      (result.stderr ?? "").trim().split(/\r?\n/)[0] || "Confirma que estás num repositório git."
    );
  return result.stdout;
}

// -z: nomes sem aspas nem escapes (ex.: pastas com acentos).
export function stagedNames(cwd) {
  return gitOutput(cwd, ["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean);
}

// Só olha para as linhas que o commit acrescenta. --no-color e --no-ext-diff: a configuração
// do utilizador não pode mudar o formato que estamos a ler.
export function checkStagedContent(cwd) {
  const diff = gitOutput(cwd, ["diff", "--cached", "-U0", "--no-color", "--no-ext-diff"]);
  const added = diff.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  const hits = SECRET_TEXT.filter(([re]) => added.some((line) => re.test(line))).map(([, label]) => label);
  if (hits.length)
    throw new CliError(
      `O commit contém possíveis segredos: ${[...new Set(hits)].join(", ")}.`,
      "Tira-os do ficheiro (git diff --cached mostra onde estão) e volta a preparar."
    );
}
