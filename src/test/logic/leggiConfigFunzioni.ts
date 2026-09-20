/**
 * Le funzioni con verify_jwt = false in supabase/config.toml, lette riga per
 * riga: una voce vale per la sezione in cui sta, come la legge la CI.
 *
 * Non con una regex «dalla testata fino alla prossima parentesi quadra»: così
 * leggevano i due test del gateway e scripts/check-edge-fn-auth.mjs, e una
 * sezione vuota si prendeva il verify_jwt di quella dopo. Nel file ce n'è una,
 * google-calendar-sync (lasciata vuota apposta: lì il gateway deve restare
 * chiuso): risultava aperta lei, e check-lifecycle-events, che aperta lo è
 * davvero, spariva dall'elenco — e con lei da ogni controllo. Trovato il
 * 20/09/2026 confrontando il file con lo stato vero in produzione.
 */
export function funzioniSenzaJwt(config: string): string[] {
  const aperte: string[] = [];
  let funzione: string | null = null;
  for (const riga of config.split("\n")) {
    const testata = riga.match(/^\[([^\]]+)\]\s*$/);
    if (testata) {
      funzione = testata[1].startsWith("functions.") ? testata[1].slice("functions.".length) : null;
      continue;
    }
    if (funzione && /^\s*verify_jwt\s*=\s*false\b/.test(riga)) aperte.push(funzione);
  }
  return aperte;
}

/** Tutte le sezioni [functions.x], nell'ordine del file (con le ripetizioni). */
export function funzioniConVoce(config: string): string[] {
  return [...config.matchAll(/^\[functions\.([^\]]+)\]\s*$/gm)].map((m) => m[1]);
}
