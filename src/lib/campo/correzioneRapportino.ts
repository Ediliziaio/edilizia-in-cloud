/** Rifiuta misure ambigue: una correzione non deve trasformare un errore in zero. */
export function misuraRapportino(v: unknown, nome: string, massimo = Number.MAX_SAFE_INTEGER): number {
  const testo = String(v ?? "").trim().replace(",", ".");
  const n = Number(testo);
  if (!/^\d+(?:\.\d+)?$/.test(testo) || !Number.isFinite(n) || n < 0 || n > massimo)
    throw new Error(`${nome}: inserisci un numero valido tra 0 e ${massimo === Number.MAX_SAFE_INTEGER ? "9007199254740991" : massimo}.`);
  return n;
}

export function riferimentiUnici(righe: Record<string, unknown>[], chiave: string, nome: string) {
  const ids = righe.map((r) => r[chiave]).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error(`${nome}: la stessa risorsa compare più volte.`);
}
