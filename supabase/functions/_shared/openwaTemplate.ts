/**
 * openwaTemplate — spintax e sostituzione variabili per i messaggi WhatsApp
 * Locale. Logica PURA (niente Deno/Supabase), testabile in vitest.
 */

/** Risolve lo spintax "{ciao|salve|buongiorno}" scegliendo un'opzione a caso.
 *  Variare il testo evita l'impronta "stesso messaggio in massa" = spam. */
export function applySpintax(text: string): string {
  // Piu' passate: {a|{b|c}} risolve prima l'interno, poi l'esterno. Una sola
  // passata spediva "{a|c}" con le graffe.
  let out = text ?? "";
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/\{([^{}]+)\}/g, (whole, inner) => {
      const opts = String(inner).split("|");
      if (opts.length < 2) return whole; // non è spintax, lascia com'è
      return opts[Math.floor(Math.random() * opts.length)].trim();
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Sostituisce le variabili {{nome}} coi dati del contatto.
 *
 * Il campo messaggio delle campagne suggerisce {{nome}}, ma NESSUNO lo
 * sostituiva: applySpintax gestisce solo {a|b}, e su {{nome}} si limitava a
 * mangiare una graffa. Ai destinatari arrivava "Ciao {nome}," — cioe' il
 * biglietto da visita dello spam mal fatto, e la via piu' rapida per farsi
 * segnalare (che e' esattamente cio' che tutto l'anti-ban cerca di evitare).
 *
 * Se una variabile non ha valore la frase deve restare pulita: si toglie il
 * segnaposto e si normalizzano spazi e punteggiatura rimasti orfani
 * ("Ciao ," → "Ciao").
 */
export function applyVariabili(text: string, dati: Record<string, string | null | undefined>): string {
  // {{chiave}} oppure {{chiave|testo di riserva}}: se il dato manca si usa la
  // riserva (es. "{{nome|ciao}}" → "ciao"); senza riserva il segnaposto sparisce.
  let out = (text ?? "").replace(/\{\{\s*([a-zA-Z_][\w.]*)\s*(?:\|([^{}]*))?\}\}/g, (_m, chiave, riserva) => {
    const v = dati[String(chiave).toLowerCase()];
    if (v && String(v).trim()) return String(v).trim();
    return riserva != null ? String(riserva).trim() : "";
  });
  // Ripulisce cio' che resta dopo un segnaposto vuoto.
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])\s*([,.;:!?])/g, "$2")
    .replace(/^[ \t]*[,;:][ \t]*/gm, "");
  return out;
}
