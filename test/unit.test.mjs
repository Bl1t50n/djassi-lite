import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { checkArgs, commandText } from "../src/exec.mjs";
import { CliError } from "../src/errors.mjs";
import { findProject } from "../src/detect.mjs";
import { gitPlan } from "../src/git.mjs";
import { planTask } from "../src/tasks.mjs";
import { soundCommand } from "../src/sounds.mjs";
import { tempDir } from "./support.mjs";

const project = (over) => ({ root: "/x", stacks: [], files: new Set(), scripts: {}, packageManager: "npm", ...over });

test("shim arguments must be plain words; real programs get argv untouched", () => {
  assert.doesNotThrow(() => checkArgs("npm", ["run", "test", "--", "--watch=1"]));
  assert.throws(() => checkArgs("npm", ["run", "test", "--", "a&calc"]), CliError);
  assert.throws(() => checkArgs("pnpm", ["run", "%PATH%"]), CliError);
  assert.doesNotThrow(() => checkArgs("git", ["commit", "-m", "Olá & adeus"]));
});

test("commandText quotes arguments that contain spaces", () => {
  assert.equal(commandText("git", ["commit", "-m", "Olá mundo"]), 'git commit -m "Olá mundo"');
});

test("findProject walks up to the nearest marker and reads the lockfile manager", () => {
  const root = tempDir();
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "x" } }));
  writeFileSync(join(root, "pnpm-lock.yaml"), "");
  mkdirSync(join(root, "src", "deep"), { recursive: true });
  const found = findProject(join(root, "src", "deep"));
  assert.equal(found.root, root);
  assert.deepEqual(found.stacks, ["node"]);
  assert.equal(found.packageManager, "pnpm");
});

test("several unrelated projects in one folder are not guessed", () => {
  const root = tempDir();
  mkdirSync(join(root, "frontend"));
  writeFileSync(join(root, "frontend", "package.json"), "{}");
  mkdirSync(join(root, "backend"));
  writeFileSync(join(root, "backend", "requirements.txt"), "");
  assert.throws(
    () => findProject(root),
    (error) => error instanceof CliError && error.hint.includes("frontend") && error.hint.includes("backend")
  );
  assert.equal(findProject(root, { explicit: join(root, "backend") }).stacks[0], "python");
});

test("dev prefers dev, then start:dev, serve, start; run prefers start then dev", () => {
  const p = project({ stacks: ["node"], scripts: { start: "a", "start:dev": "b" } });
  assert.deepEqual(planTask(p, "dev").args, ["run", "start:dev"]);
  assert.deepEqual(planTask(p, "run").args, ["run", "start"]);
});

test("extra arguments go after -- for npm and directly for yarn", () => {
  const npm = project({ stacks: ["node"], scripts: { test: "t" } });
  assert.deepEqual(planTask(npm, "test", { extra: ["--watch"] }).args, ["run", "test", "--", "--watch"]);
  const yarn = project({ stacks: ["node"], scripts: { test: "t" }, packageManager: "yarn" });
  assert.deepEqual(planTask(yarn, "test", { extra: ["--watch"] }).args, ["test", "--watch"]);
});

test("Django runs the server for dev; unknown and prototype task names return null", () => {
  const django = project({ stacks: ["python"], files: new Set(["manage.py"]) });
  assert.deepEqual(planTask(django, "dev").args, ["manage.py", "runserver"]);
  assert.equal(planTask(project({ stacks: ["node"] }), "constructor"), null);
  assert.equal(planTask(project({ stacks: ["python"], files: new Set(["main.py"]) }), "constructor"), null);
});

test("invalid task names are refused and --stack limits the stack", () => {
  assert.throws(() => planTask(project({ stacks: ["node"] }), "rm -rf"), CliError);
  const mixed = project({ stacks: ["node", "python"], scripts: { test: "t" }, files: new Set(["main.py"]) });
  assert.equal(planTask(mixed, "test", { stack: "python" }).tool, "python");
});

test("git plans: broad, forced and refspec operations are refused", () => {
  assert.deepEqual(gitPlan("commit", ["-m", "Olá mundo"]), ["commit", "-m", "Olá mundo"]);
  assert.throws(() => gitPlan("stage", ["."]), CliError);
  assert.throws(() => gitPlan("commit", []), CliError);
  assert.throws(() => gitPlan("push", ["--force"]), CliError);
  assert.throws(() => gitPlan("push", ["origin", "+main:main"]), CliError);
  assert.throws(() => gitPlan("push", ["origin", ":velho"]), CliError);
  assert.deepEqual(gitPlan("branch", ["feat/pagina"]), ["switch", "-c", "feat/pagina"]);
  assert.throws(() => gitPlan("branch", ["../fora"]), CliError);
});

test("sound settings reject unknown events, bad volumes and missing files", () => {
  process.env.DJASSI_CONFIG_DIR = tempDir();
  try {
    assert.throws(() => soundCommand("set", "commit", "x.mp3", { event: "boom" }), CliError);
    assert.throws(() => soundCommand("list", undefined, undefined, { volume: 500 }), CliError);
    assert.throws(() => soundCommand("set", "commit", "nao-existe.mp3"), CliError);
  } finally {
    delete process.env.DJASSI_CONFIG_DIR;
  }
});
