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
  /** Le fasi da fare oggi su quel cantiere. */
  fasi?: string[];
}

export function componiTodoOperaio(nome: string | null, cantieri: CantiereTodo[], attivita: string[] = []): string {
  const saluto = `Ciao ${(nome ?? "").trim()}`.trim().replace(/,?$/, ",");
  if (cantieri.length === 0) return `${saluto} oggi non risultano cantieri assegnati. Buona giornata!`;

  const blocchi = cantieri.map((c) => {
    const righe = [`📍 ${c.titolo}`];
    if (c.indirizzo?.trim()) righe.push(`📌 ${c.indirizzo.trim()}`);
    if (c.fasi && c.fasi.length > 0) righe.push(`🔨 Oggi: ${c.fasi.join(", ")}`);
    if (c.descrizione?.trim()) righe.push(c.descrizione.trim());
    if (c.conChi && c.conChi.length > 0) righe.push(`👷 Con: ${c.conChi.join(", ")}`);
    return righe.join("\n");
  }).join("\n\n");
  const cose = attivita.length > 0 ? `\n\n✅ Da fare: ${attivita.join("; ")}` : "";

  return `${saluto} oggi lavori su:\n\n${blocchi}${cose}\n\nA fine giornata mandami il rapportino, anche a voce.`;
}

/**
 * Chi è già coperto da un rapportino di oggi (18/10/2026): l'autore, chi è nelle
 * presenze (la squadra nel rapportino del capocantiere) e il dipendente delle
 * ore registrate dall'ufficio. Restituisce gli id dei dipendenti.
 */
export function copertiDaRapportini(
  rapportini: Array<{ user_id?: string | null; presenze?: unknown; ufficio_employee_id?: string | null }>,
  dipendenteDiUtente: (userId: string) => string | null,
): Set<string> {
  const coperti = new Set<string>();
  for (const rp of rapportini) {
    const autore = rp.user_id ? dipendenteDiUtente(rp.user_id) : null;
    if (autore) coperti.add(autore);
    if (rp.ufficio_employee_id) coperti.add(rp.ufficio_employee_id);
    for (const p of Array.isArray(rp.presenze) ? rp.presenze : []) {
      const id = (p as { employee_id?: unknown })?.employee_id;
      if (typeof id === "string" && id) coperti.add(id);
    }
  }
  return coperti;
}
