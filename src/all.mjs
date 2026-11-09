import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { CliError } from "./errors.mjs";
import { findProject } from "./detect.mjs";
import { checkArgs, commandText, usesShell } from "./exec.mjs";
import { planTask } from "./tasks.mjs";

const COLORS = [36, 35, 33, 32, 34, 91, 96];

// Projetos nas pastas diretas (ex.: backend/ e frontend/). Ignora ocultas e node_modules.
export function projectsIn(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
    .flatMap((entry) => {
      const dir = join(root, entry.name);
      try {
        return [findProject(dir, { explicit: dir })];
      } catch {
        return [];
      }
    });
}

function runJob({ project, plan }, index, color) {
  const label = `[${basename(project.root)}] `;
  const prefix = color ? `\x1b[${COLORS[index % COLORS.length]}m${label}\x1b[0m` : label;
  return new Promise((done) => {
    const child = spawn(plan.tool, plan.args, {
      cwd: project.root,
      shell: usesShell(plan.tool),
      windowsHide: true,
      stdio: ["inherit", "pipe", "pipe"]
    });
    const pipe = (stream, out) => {
      let pending = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        const lines = (pending + chunk).split(/\r?\n/);
        pending = lines.pop();
        for (const line of lines) out.write(`${prefix}${line}\n`);
      });
      stream.on("end", () => {
        if (pending) out.write(`${prefix}${pending}\n`);
      });
    };
    pipe(child.stdout, process.stdout);
    pipe(child.stderr, process.stderr);
    child.on("error", (error) => {
      console.error(`${prefix}✖ ${error.message}`);
      done(1);
    });
    child.on("close", (code) => done(code ?? 1));
  });
}

// Corre a tarefa em todos os projetos das pastas diretas, em paralelo.
export async function runAll(root, action, extra, { dryRun = false, color = Boolean(process.stdout.isTTY) } = {}) {
  const jobs = projectsIn(root)
    .map((project) => ({ project, plan: planTask(project, action, { extra }) }))
    .filter((job) => job.plan);
  if (!jobs.length)
    throw new CliError(
      `Não encontrei projetos com '${action}' nas pastas de '${root}'.`,
      "Vê o que existe com: djassi inspect --project <pasta>"
    );
  for (const { plan } of jobs) checkArgs(plan.tool, plan.args);
  for (const { project, plan } of jobs)
    console.log(`→ [${basename(project.root)}] ${commandText(plan.tool, plan.args)}`);
  if (dryRun) {
    console.log("(simulação: nada foi executado)");
    return 0;
  }
  const codes = await Promise.all(jobs.map((job, i) => runJob(job, i, color)));
  return codes.every((code) => code === 0) ? 0 : 1;
}
