/**
 * Il messaggio del mattino a un operaio con le sue cose del giorno (28/09/2026):
 * i cantieri assegnati per oggi. Testo breve per WhatsApp.
 */
export function componiTodoOperaio(nome: string | null, cantieri: string[]): string {
  const saluto = `Ciao ${(nome ?? "").trim()}`.trim().replace(/,?$/, ",");
  if (cantieri.length === 0) return `${saluto} oggi non risultano cantieri assegnati. Buona giornata!`;
  const lista = cantieri.map((c) => `• ${c}`).join("\n");
  return `${saluto} oggi lavori su:\n${lista}\n\nA fine giornata mandami il rapportino, anche a voce.`;
}
