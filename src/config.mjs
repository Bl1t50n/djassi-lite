import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CliError } from "./errors.mjs";

const NAME = /^[A-Za-z][A-Za-z0-9:_-]*$/;

// djassi.json (opcional, na raiz do projeto) define tarefas próprias:
//   { "tasks": { "seed": ["npm", "run", "db:seed"] } }
// Cada tarefa é [ferramenta, ...argumentos], sem shell.
export function loadTasks(root) {
  const path = join(root, "djassi.json");
  if (!existsSync(path)) return {};
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new CliError(`djassi.json inválido em '${root}'.`, "Confirma que é JSON válido.");
  }
  const tasks = data.tasks ?? {};
  for (const [name, command] of Object.entries(tasks)) {
    const valid =
      NAME.test(name) &&
      Array.isArray(command) &&
      command.length > 0 &&
      command.every((part) => typeof part === "string");
    if (!valid)
      throw new CliError(`Tarefa inválida em djassi.json: '${name}'.`, 'Formato: "nome": ["ferramenta", "argumento"]');
  }
  return tasks;
}
