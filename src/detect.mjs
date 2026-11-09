import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CliError } from "./errors.mjs";

export const STACK_LABEL = {
  node: "Node.js",
  python: "Python",
  gradle: "Gradle (Java)",
  java: "Maven (Java)",
  dotnet: ".NET",
  go: "Go",
  rust: "Rust",
  make: "Makefile (C/C++)"
};

const MANAGERS = ["npm", "pnpm", "yarn", "bun"];
const LOCKFILES = new Map([
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"]
]);

function namesIn(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// Só olha para a pasta indicada. Quem sobe pelas pastas é findProject.
function stacksIn(names) {
  const has = (...list) => list.some((name) => names.includes(name));
  const stacks = [];
  if (has("package.json")) stacks.push("node");
  if (has("pyproject.toml", "requirements.txt", "manage.py", "main.py")) stacks.push("python");
  if (has("build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"))
    stacks.push("gradle");
  if (has("pom.xml")) stacks.push("java");
  if (names.some((name) => /\.(csproj|sln|slnx)$/i.test(name))) stacks.push("dotnet");
  if (has("go.mod")) stacks.push("go");
  if (has("Cargo.toml")) stacks.push("rust");
  if (has("Makefile", "makefile")) stacks.push("make");
  return stacks;
}

function describe(root, names) {
  const pkg = names.includes("package.json") ? readJson(join(root, "package.json")) : null;
  const declared = typeof pkg?.packageManager === "string" ? pkg.packageManager.split("@")[0] : "";
  const lock = names.find((name) => LOCKFILES.has(name));
  const packageManager = MANAGERS.includes(declared) ? declared : (LOCKFILES.get(lock) ?? "npm");
  const scripts = pkg?.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
  return { root, stacks: stacksIn(names), files: new Set(names), scripts, packageManager };
}

// Sem --project: sobe a partir da pasta atual até achar um marcador.
// Não adivinha entre vários projetos irmãos: pede --project.
export function findProject(start, { explicit } = {}) {
  if (explicit !== undefined) {
    const root = resolve(explicit);
    const names = namesIn(root);
    if (!stacksIn(names).length)
      throw new CliError(
        `Não reconheço um projeto em '${explicit}'.`,
        "Projetos suportados: Node, Python, Java (Maven/Gradle), .NET, Go, Rust e Makefile."
      );
    return describe(root, names);
  }
  const begin = resolve(start);
  for (let dir = begin; ; dir = dirname(dir)) {
    const names = namesIn(dir);
    if (stacksIn(names).length) return describe(dir, names);
    if (dirname(dir) === dir) break;
  }
  const folders = namesIn(begin).filter(
    (name) => !name.startsWith(".") && name !== "node_modules" && stacksIn(namesIn(join(begin, name))).length
  );
  throw new CliError(
    "Não encontrei nenhum projeto nesta pasta nem nas pastas acima.",
    folders.length
      ? `Encontrei vários projetos aqui: ${folders.join(", ")}. Usa --project <pasta>.`
      : "Abre a pasta do projeto ou usa --project <pasta>."
  );
}
