import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAll } from "./all.mjs";
import { BRAND } from "./brand.mjs";
import { loadTasks } from "./config.mjs";
import { doctor } from "./doctor.mjs";
import { STACK_LABEL, findProject } from "./detect.mjs";
import { CliError } from "./errors.mjs";
import { checkArgs, commandText, runTool } from "./exec.mjs";
import { GIT_VERBS, WRITE_VERBS, gitPlan } from "./git.mjs";
import { installPowerShell } from "./powershell.mjs";
import { playCommandSound, soundCommand } from "./sounds.mjs";
import { checkStageFiles, checkStagedContent, stagedNames } from "./secrets.mjs";
import { availableTasks, planTask } from "./tasks.mjs";
import { isNewer, latestVersion } from "./update.mjs";
import { killCommand, portsReport, ramReport } from "./system.mjs";

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
);
const VALUE_FLAGS = ["--project", "--stack", "--port"];
const SWITCHES = {
  "--dry-run": "dry-run",
  "--no-sound": "no-sound",
  "--all": "all",
  "--help": "help",
  "-h": "help",
  "--version": "version",
  "-v": "version"
};

const HELP = `${BRAND.banner}

Uso: ${BRAND.command} <comando> [opções]

Projeto
  inspect                    Mostra o tipo de projeto e as tarefas disponíveis
  doctor                     Verifica se tens as ferramentas necessárias
  dev [--all]                Arranca o projeto (--all: todas as pastas, em paralelo)
  run [tarefa] [-- extra]    Corre uma tarefa (test, build, lint...). Sem tarefa: start ou dev
  update                     Diz se há versão nova (nunca se instala sozinho)

Sistema (Windows)
  ports                      Portas em escuta e o processo de cada uma
  ram                        Processos que mais memória usam, e se são do Windows ou de apps
  kill <pid> [--force]       Para um processo (pede confirmação; --yes salta)
  kill --port <n>            Para o processo que está na porta n

Git (com proteções)
  status | log | diff        Vê o estado do repositório
  stage <ficheiros>          Prepara ficheiros (recusa segredos como .env e chaves)
  unstage <ficheiros>        Tira ficheiros do próximo commit
  commit -m "mensagem"       Cria um commit (recusa tokens no diff)
  push [-u] [remoto] [ramo]  Envia commits (nunca com --force)
  pull                       Traz alterações (só fast-forward)
  branch [nome]              Lista os ramos ou cria um e muda para ele
  switch <ramo>              Muda de ramo

Sons
  sound list
  sound set <comando> <ficheiro> [--event success|error] [--volume 0-100]
  sound remove <comando> [--event success|error]
  sound play <comando> [--event success|error]
  sound mute | unmute
  sound shell powershell     Liga os sons aos comandos git do PowerShell

Opções
  --project <pasta>   Usa esta pasta em vez da atual
  --stack <nome>      Escolhe o tipo de projeto quando há vários
  --dry-run           Mostra o comando sem o executar
  --no-sound          Não toca som neste comando
  -h, --help          Mostra esta ajuda
  -v, --version       Mostra a versão

Tarefas próprias: põe um djassi.json na raiz do projeto com
  { "tasks": { "seed": ["npm", "run", "db:seed"] } }`;

const say = (...lines) => {
  for (const line of lines) console.log(line);
  return 0;
};
const dryRunDone = () => say("(simulação: nada foi executado)");

export function parseArgv(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      rest.push(...argv.slice(i));
      break;
    }
    if (VALUE_FLAGS.includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-"))
        throw new CliError(`Falta o valor de ${arg}.`, `Exemplo: ${arg} ./meu-projeto`);
      flags[arg.slice(2)] = value;
      i += 1;
    } else if (Object.hasOwn(SWITCHES, arg)) {
      flags[SWITCHES[arg]] = true;
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

function splitExtra(list) {
  const at = list.indexOf("--");
  return at === -1
    ? { head: list, extra: [] }
    : { head: list.slice(0, at), extra: list.slice(at + 1) };
}

function takeOption(list, name) {
  const at = list.indexOf(name);
  if (at === -1) return undefined;
  const value = list[at + 1];
  if (value === undefined || value.startsWith("--"))
    throw new CliError(`Falta o valor de ${name}.`);
  list.splice(at, 2);
  return value;
}

function notify(ctx, command, code) {
  if (!ctx.silent) playCommandSound(command, code === 0 ? "success" : "error");
}

function runTask(ctx, action, extra) {
  const project = findProject(ctx.cwd, { explicit: ctx.flags.project });
  const stack = ctx.flags.stack;
  if (stack && !project.stacks.includes(stack))
    throw new CliError(`Este projeto não tem '${stack}'.`, `Disponíveis: ${project.stacks.join(", ")}`);
  const custom = loadTasks(project.root)[action];
  const plan = custom
    ? { tool: custom[0], args: [...custom.slice(1), ...extra] }
    : planTask(project, action, { stack, extra });
  if (!plan)
    throw new CliError(
      `Não sei fazer '${action}' neste projeto.`,
      `Tarefas disponíveis: ${availableTasks(project).map((t) => t.action).join(", ") || "nenhuma"}`
    );
  checkArgs(plan.tool, plan.args);
  say(`Projeto: ${project.root}`);
  if (!stack && project.stacks.length > 1)
    say(`(também encontrei: ${project.stacks.slice(1).map((s) => STACK_LABEL[s]).join(", ")}; usa --stack para escolher)`);
  say(`→ ${commandText(plan.tool, plan.args)}`);
  if (ctx.flags["dry-run"]) return dryRunDone();
  const code = runTool(plan.tool, plan.args, { cwd: project.root });
  notify(ctx, action, code);
  return code;
}

function gitCommand(ctx, verb, args) {
  const gitArgs = gitPlan(verb, args);
  const cwd = ctx.flags.project ? resolve(ctx.flags.project) : ctx.cwd;
  if (!existsSync(cwd)) throw new CliError(`A pasta '${cwd}' não existe.`);
  if (verb === "stage") checkStageFiles(args);
  if (verb === "commit") {
    checkStageFiles(stagedNames(cwd));
    checkStagedContent(cwd);
  }
  say(`→ ${commandText("git", gitArgs)}`);
  if (ctx.flags["dry-run"]) return dryRunDone();
  const code = runTool("git", gitArgs, { cwd });
  if (code === 0 && WRITE_VERBS.has(verb)) notify(ctx, verb, 0);
  return code;
}

function inspect(ctx) {
  const project = findProject(ctx.cwd, { explicit: ctx.flags.project });
  const custom = loadTasks(project.root);
  say(
    `Projeto: ${project.root}`,
    `Tipo: ${project.stacks.map((s) => STACK_LABEL[s]).join(", ")}`
  );
  if (project.stacks.includes("node")) say(`Gestor de pacotes: ${project.packageManager}`);
  const tasks = availableTasks(project);
  say("Tarefas:");
  if (!tasks.length && !Object.keys(custom).length) say("  nenhuma reconhecida");
  for (const task of tasks) say(`  ${task.action.padEnd(6)} → ${commandText(task.tool, task.args)}`);
  for (const [name, command] of Object.entries(custom))
    say(`  ${name.padEnd(6)} → ${command.join(" ")} (djassi.json)`);
  return 0;
}

function doctorCommand(ctx) {
  let project = null;
  try {
    project = findProject(ctx.cwd, { explicit: ctx.flags.project });
  } catch (error) {
    if (ctx.flags.project || !(error instanceof CliError)) throw error;
  }
  say(project ? `Projeto: ${project.root}` : "Fora de um projeto: verifico só o básico.");
  const checks = doctor(project);
  for (const check of checks) {
    say(`${check.ok ? "✔" : "✖"} ${check.name}: ${check.detail}`);
    if (!check.ok && check.hint) say(`    → ${check.hint}`);
  }
  const failed = checks.filter((check) => !check.ok).length;
  say(failed ? `${failed} coisa(s) para resolver.` : "Tudo pronto.");
  return failed ? 1 : 0;
}

async function updateCommand() {
  const latest = await latestVersion({ force: true });
  if (!latest) {
    console.error(`✖ Não consegui verificar atualizações (versão atual: ${pkg.version}).`);
    return 1;
  }
  if (!isNewer(latest, pkg.version)) return say(`Estás na última versão (${pkg.version}).`);
  return say(
    `Versão nova: ${latest} (tens ${pkg.version}).`,
    "Atualiza com:",
    `  npm install -g ${BRAND.installSpec}`,
    "(o CLI não se atualiza sozinho: corres tu o comando)"
  );
}

function sound(ctx, args) {
  const [operation = "list", ...rest] = args;
  const dryRun = Boolean(ctx.flags["dry-run"]);
  if (operation === "shell") {
    if (rest[0] !== "powershell")
      throw new CliError(`Só existe '${BRAND.command} sound shell powershell'.`);
    return say(installPowerShell({ dryRun }).summary);
  }
  const event = takeOption(rest, "--event") ?? "success";
  const volume = takeOption(rest, "--volume");
  const [command, file] = rest;
  if (operation === "notify") {
    soundCommand("notify", command, undefined, { event, dryRun });
    return 0;
  }
  const result = soundCommand(operation, command, file, { event, volume, dryRun });
  if (operation === "list") {
    const lines = Object.entries(result.commands).flatMap(([name, events]) =>
      Object.entries(events).map(([ev, path]) => `  ${name} (${ev}): ${path}`)
    );
    return say(
      `Sons: ${result.enabled ? "ativados" : "desligados"} · volume ${result.volume}`,
      ...(lines.length ? lines : ["  (nenhum som configurado)"]),
      `Configuração: ${result.path}`
    );
  }
  if (operation === "play") {
    if (dryRun) return say(`Ficheiro: ${result.file}`);
    say(result.played ? "Som reproduzido." : "Não consegui reproduzir o som.");
    return result.played ? 0 : 1;
  }
  return say(result.summary);
}

function dispatch(argv) {
  const { flags, rest } = parseArgv(argv);
  const [command, ...args] = rest;
  if (flags.version) return say(pkg.version);
  if (flags.help || !command || command === "help") return say(HELP);
  const ctx = {
    flags,
    cwd: process.cwd(),
    silent: Boolean(flags["no-sound"]) || process.env.DJASSI_NO_SOUND === "1"
  };
  if (command === "inspect") return inspect(ctx);
  if (command === "doctor") return doctorCommand(ctx);
  if (command === "update") return updateCommand();
  if (command === "ports") return say(...portsReport());
  if (command === "ram") return say(...ramReport());
  if (command === "kill") {
    // --yes e --force só valem para kill: noutros comandos (ex.: push --force) ficam para o git recusar.
    const pid = args.find((arg) => !arg.startsWith("--"));
    return killCommand({
      pid,
      port: flags.port,
      yes: args.includes("--yes"),
      force: args.includes("--force")
    });
  }
  if (command === "dev") {
    const { head, extra } = splitExtra(args);
    if (head.length)
      throw new CliError("'dev' não aceita nomes de tarefa.", `Para outra tarefa usa: ${BRAND.command} run <tarefa>`);
    if (flags.all) return runAll(ctx.cwd, "dev", extra, { dryRun: Boolean(flags["dry-run"]) });
    return runTask(ctx, "dev", extra);
  }
  if (command === "run") {
    const { head, extra } = splitExtra(args);
    if (head.length > 1) throw new CliError("Indica uma tarefa só.", "Exemplo: djassi run test");
    return runTask(ctx, head[0] ?? "run", extra);
  }
  if (command === "sound") return sound(ctx, args);
  if (GIT_VERBS.includes(command)) return gitCommand(ctx, command, args);
  throw new CliError(`Não conheço o comando '${command}'.`, "Vê os comandos com: djassi --help");
}

export async function main(argv) {
  try {
    const { flags, rest } = parseArgv(argv);
    const [command] = rest;
    const interactive = process.stdout.isTTY && command && !["update", "help"].includes(command);
    if (interactive && !flags.version && !flags.help) {
      const latest = await latestVersion();
      if (latest && isNewer(latest, pkg.version))
        console.error(`↑ Versão nova ${latest} (tens ${pkg.version}). Atualiza com: ${BRAND.command} update`);
    }
    return await dispatch(argv);
  } catch (error) {
    if (error instanceof CliError) {
      console.error(`✖ ${error.message}`);
      if (error.hint) console.error(`  → ${error.hint}`);
    } else {
      console.error(`✖ Erro inesperado: ${error.message}`);
    }
    return 1;
  }
}
