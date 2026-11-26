/**
 * La programmazione nel database c'è? Finché la migrazione non è applicata
 * ogni funzione risponde 404: lo si scopre una volta e per 10 minuti non si
 * richiede più (console pulita, pagina più veloce). Dopo si riprova da soli,
 * così quando la migrazione arriva la pagina se ne accorge senza ricaricare.
 */
const CHIAVE = "programmazione:db-mancante";
const ATTESA = 10 * 60_000;

export function funzioneMancante(e: unknown): boolean {
  const x = e as { code?: string; message?: string } | null;
  return x?.code === "PGRST202" || x?.code === "42883" || /could not find the function/i.test(x?.message ?? "");
}

export function programmazioneAssente(): boolean {
  try {
    const t = Number(sessionStorage.getItem(CHIAVE));
    return Number.isFinite(t) && t > 0 && Date.now() - t < ATTESA;
  } catch {
    return false;
  }
}

export function segnaProgrammazioneAssente() {
  try { sessionStorage.setItem(CHIAVE, String(Date.now())); } catch { /* niente */ }
}
