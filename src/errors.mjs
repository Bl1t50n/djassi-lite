// Erros esperados: a mensagem diz o que aconteceu, a dica diz o que fazer a seguir.
export class CliError extends Error {
  constructor(message, hint = "") {
    super(message);
    this.name = "CliError";
    this.hint = hint;
  }
}
