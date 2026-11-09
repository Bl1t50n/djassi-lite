import { probe } from "./exec.mjs";

const HINT = {
  node: "Instala Node.js 22 ou mais recente: https://nodejs.org",
  git: "Instala Git: https://git-scm.com/downloads",
  npm: "Vem com o Node.js: https://nodejs.org",
  pnpm: "npm install -g pnpm   (ou: corepack enable)",
  yarn: "corepack enable   (guia: https://yarnpkg.com/getting-started/install)",
  bun: "https://bun.sh",
  python: "https://www.python.org/downloads/ (no Windows marca 'Add python.exe to PATH')",
  mvn: "https://maven.apache.org/install.html",
  gradle: "https://gradle.org/install/ (ou usa o gradlew do projeto)",
  dotnet: "https://dotnet.microsoft.com/download",
  go: "https://go.dev/dl/",
  cargo: "https://rustup.rs",
  make: "Instala GNU Make (no Windows: o make do Git Bash ou do MSYS2)"
};

function toolsFor(project) {
  const tools = new Set();
  const { stacks, files, packageManager } = project;
  if (stacks.includes("node")) tools.add(packageManager);
  if (stacks.includes("python")) tools.add("python");
  if (stacks.includes("java")) tools.add("mvn");
  if (stacks.includes("gradle") && !files.has("gradlew") && !files.has("gradlew.bat")) tools.add("gradle");
  if (stacks.includes("dotnet")) tools.add("dotnet");
  if (stacks.includes("go")) tools.add("go");
  if (stacks.includes("rust")) tools.add("cargo");
  if (stacks.includes("make")) tools.add("make");
  return [...tools];
}

// Só lê o estado da máquina; não escreve nada.
export function doctor(project) {
  const checks = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({ name: "Node.js", ok: major >= 22, detail: process.version, hint: HINT.node });
  const git = probe("git");
  checks.push({ name: "Git", ok: Boolean(git), detail: git ?? "não encontrado", hint: HINT.git });
  for (const key of ["user.name", "user.email"]) {
    const value = probe("git", ["config", "--get", key]);
    checks.push({
      name: `Git ${key}`,
      ok: Boolean(value),
      detail: value ?? "por definir",
      hint: `git config --global ${key} "valor"`
    });
  }
  for (const tool of project ? toolsFor(project) : []) {
    const version = probe(tool);
    checks.push({ name: tool, ok: Boolean(version), detail: version ?? "não encontrado", hint: HINT[tool] ?? "" });
  }
  return checks;
}
