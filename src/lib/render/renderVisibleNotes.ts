/** Conserva le richieste; nasconde la legenda automatica destinata al modello AI. */
export function renderVisibleNotes(note: unknown): string {
  return typeof note === "string" ? note.split("\n").filter((r) => !r.startsWith("AUTHORITATIVE SOURCE FIXTURE POSITIONS:")).join("\n").trim() : "";
}
