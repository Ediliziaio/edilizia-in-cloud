/**
 * Il messaggio del mattino a un operaio con le sue cose del giorno (28/09/2026):
 * per ogni cantiere il codice/descrizione, l'indirizzo e con chi lavora. Testo
 * breve per WhatsApp.
 */

export interface CantiereTodo {
  titolo: string;
  indirizzo?: string | null;
  descrizione?: string | null;
  conChi?: string[];
}

export function componiTodoOperaio(nome: string | null, cantieri: CantiereTodo[]): string {
  const saluto = `Ciao ${(nome ?? "").trim()}`.trim().replace(/,?$/, ",");
  if (cantieri.length === 0) return `${saluto} oggi non risultano cantieri assegnati. Buona giornata!`;

  const blocchi = cantieri.map((c) => {
    const righe = [`📍 ${c.titolo}`];
    if (c.indirizzo?.trim()) righe.push(`📌 ${c.indirizzo.trim()}`);
    if (c.descrizione?.trim()) righe.push(c.descrizione.trim());
    if (c.conChi && c.conChi.length > 0) righe.push(`👷 Con: ${c.conChi.join(", ")}`);
    return righe.join("\n");
  }).join("\n\n");

  return `${saluto} oggi lavori su:\n\n${blocchi}\n\nA fine giornata mandami il rapportino, anche a voce.`;
}
