import { CliError } from "./errors.mjs";

const NAME = /^[A-Za-z][A-Za-z0-9:_-]*$/;
const NODE_DEV = ["dev", "start:dev", "serve", "start"];
const NODE_RUN = ["start", "dev"];

function gradleTool(files) {
  if (process.platform === "win32") return files.has("gradlew.bat") ? "gradlew.bat" : "gradle";
  return files.has("gradlew") ? "./gradlew" : "gradle";
}

// Cada tarefa devolve [ferramenta, argumentos] ou null se a stack não a suporta.
const GENERIC = {
  python: {
    run: (f) =>
      f.has("manage.py")
        ? ["python", ["manage.py", "runserver"]]
        : f.has("main.py")
          ? ["python", ["main.py"]]
          : null,
    test: () => ["python", ["-m", "pytest"]]
  },
  gradle: {
    test: (f) => [gradleTool(f), ["test"]],
    build: (f) => [gradleTool(f), ["build"]],
    run: (f) => [gradleTool(f), ["run"]]
  },
  java: {
    test: () => ["mvn", ["test"]],
    build: () => ["mvn", ["package"]]
  },
  dotnet: {
    test: () => ["dotnet", ["test"]],
    build: () => ["dotnet", ["build"]],
    run: () => ["dotnet", ["run"]]
  },
  go: {
    test: () => ["go", ["test", "./..."]],
    build: () => ["go", ["build", "./..."]],
    run: () => ["go", ["run", "."]]
  },
  rust: {
    test: () => ["cargo", ["test"]],
    build: () => ["cargo", ["build"]],
    run: () => ["cargo", ["run"]]
  },
  make: {
    test: () => ["make", ["test"]],
    build: () => ["make", []],
    run: () => ["make", ["run"]]
  }
};

function nodeCommand(manager, script, extra) {
  if (manager === "yarn") return [manager, [script, ...extra]];
  return [manager, ["run", script, ...(extra.length ? ["--", ...extra] : [])]];
}

function nodePlan(project, action, extra) {
  const candidates = action === "dev" ? NODE_DEV : action === "run" ? NODE_RUN : [action];
  const script = candidates.find(
    (name) => Object.hasOwn(project.scripts, name) && typeof project.scripts[name] === "string"
  );
  return script ? nodeCommand(project.packageManager, script, extra) : null;
}

function genericPlan(project, stack, action, extra) {
  const key = action === "dev" ? "run" : action;
  if (!Object.hasOwn(GENERIC[stack], key)) return null;
  const command = GENERIC[stack][key](project.files);
  return command ? [command[0], [...command[1], ...extra]] : null;
}

export function planTask(project, action, { stack, extra = [] } = {}) {
  if (!NAME.test(action))
    throw new CliError(
      `Nome de tarefa inválido: '${action}'.`,
      "Usa letras, números, ':', '-' ou '_'."
    );
  for (const id of project.stacks) {
    if (stack && id !== stack) continue;
    const plan = id === "node" ? nodePlan(project, action, extra) : genericPlan(project, id, action, extra);
    if (plan) return { stack: id, tool: plan[0], args: plan[1] };
  }
  return null;
}

export function availableTasks(project) {
  return ["dev", "run", "test", "build", "lint"]
    .map((action) => ({ action, plan: planTask(project, action) }))
    .filter((entry) => entry.plan)
    .map(({ action, plan }) => ({ action, ...plan }));
}
