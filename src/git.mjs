import { CliError } from "./errors.mjs";

export const GIT_VERBS = ["status", "log", "diff", "stage", "unstage", "commit", "push", "pull", "branch", "switch"];
export const WRITE_VERBS = new Set(["stage", "unstage", "commit", "push", "pull", "branch", "switch"]);

const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const BROAD = [".", "*"];

function noFlags(args, allowed = []) {
  const flag = args.find((arg) => arg.startsWith("-") && !allowed.includes(arg));
  if (flag !== undefined)
    throw new CliError(
      `Opção não suportada: ${flag}`,
      "Para opções avançadas usa o git diretamente, por exemplo: git rebase"
    );
}

function refName(value, what) {
  if (!value || !REF.test(value) || value.includes(".."))
    throw new CliError(
      `Nome de ${what} inválido: '${value ?? ""}'.`,
      "Usa letras, números, '.', '_', '-' ou '/'."
    );
  return value;
}

// Devolve os argumentos do git. Sem shell: cada item chega ao git como um argumento só.
// Limite: sem force-push, sem apagar ramos remotos, sem reescrever histórico.
export function gitPlan(verb, args) {
  switch (verb) {
    case "status":
      noFlags(args);
      return ["status", "--short", "--branch"];
    case "log":
      noFlags(args);
      return ["log", "--oneline", "--decorate", "-n", "15"];
    case "diff":
      noFlags(args, ["--staged"]);
      return ["diff", ...args];
    case "stage":
    case "unstage": {
      if (!args.length)
        throw new CliError("Diz que ficheiros queres.", `Exemplo: djassi ${verb} README.md`);
      noFlags(args);
      if (args.some((arg) => BROAD.includes(arg)))
        throw new CliError(
          "Não adiciono tudo de uma vez.",
          "Indica os ficheiros um a um: assim vês exatamente o que entra no commit."
        );
      return verb === "stage"
        ? ["add", "--", ...args]
        : ["restore", "--staged", "--", ...args];
    }
    case "commit": {
      const [flag, message, ...more] = args;
      if (flag !== "-m" || !message || message.startsWith("-") || more.length || !message.trim())
        throw new CliError("Falta a mensagem do commit.", 'Usa: djassi commit -m "o que mudaste"');
      return ["commit", "-m", message];
    }
    case "push": {
      noFlags(args, ["-u", "--set-upstream"]);
      const refs = args.filter((arg) => !arg.startsWith("-"));
      if (refs.some((arg) => /[:+]/.test(arg)))
        throw new CliError(
          "Refspecs com ':' ou '+' não são suportados.",
          "Envia o ramo atual com: djassi push -u origin <ramo>"
        );
      refs.forEach((arg) => refName(arg, "remoto ou ramo"));
      return ["push", ...args];
    }
    case "pull":
      noFlags(args);
      return ["pull", "--ff-only", ...args.map((arg) => refName(arg, "remoto ou ramo"))];
    case "branch":
      if (!args.length) return ["branch"];
      if (args.length === 1) return ["switch", "-c", refName(args[0], "ramo")];
      throw new CliError("Indica só o nome do novo ramo.", "Exemplo: djassi branch feat/pagina");
    case "switch":
      if (args.length !== 1)
        throw new CliError("Indica o ramo para onde mudar.", "Exemplo: djassi switch main");
      return ["switch", refName(args[0], "ramo")];
    default:
      throw new CliError(`Comando git desconhecido: ${verb}`);
  }
}
