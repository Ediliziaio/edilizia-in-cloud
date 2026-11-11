/** Anche PostgREST restituisce oggetti ErrorLike, non istanze di Error. */
export function messaggioSalvataggio(errore: unknown): string {
  const e = errore as { message?: unknown; code?: unknown } | null;
  if (e?.code === "42501")
    return "Il tuo ruolo non consente questa modifica per l’azienda selezionata. Controlla i permessi Acquisti o Costi e la modalità di sola lettura.";
  if (e?.code === "23505")
    return "Questo collegamento è già presente. Aggiorna la fattura per visualizzarlo.";
  if (typeof e?.message === "string" && e.message.trim()) return e.message;
  return "Salvataggio non riuscito. Riprova e controlla la connessione.";
}

/** Un UPDATE/DELETE filtrato da RLS può terminare senza errori ma senza scrivere. */
export function esigiRigaSalvata<T>(esito: {
  data: T | null;
  error: unknown;
}): T {
  if (esito.error) throw esito.error;
  if (!esito.data)
    throw new Error(
      "La modifica non è stata salvata. Il documento potrebbe essere cambiato o non essere più modificabile: aggiorna e riprova.",
    );
  return esito.data;
}

export const chiaveCollegamenti = (azienda: string, fattura: string) =>
  ["fattura-collegamenti", azienda, fattura] as const;

/** Nessun carattere di controllo dei filtri PostgREST introdotto dall’input. */
export function filtroRicercaMezzo(ricerca: string): string | null {
  const testo = ricerca
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100);
  if (!testo) return null;
  const targa = testo.replace(/[^a-z0-9]/gi, "");
  return `nome.ilike.%${testo}%,targa.ilike.%${targa.split("").join("%") || testo}%`;
}
