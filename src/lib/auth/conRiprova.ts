/**
 * Ripete un'operazione finché il risultato è «transitorio», con le attese date.
 *
 * Nata per l'avvio dell'autenticazione (14/09/2026): quando il database
 * cancella query per timeout, profilo e ruoli non si leggono e l'app scambiava
 * «non riesco a leggere il ruolo» per «questo utente non ha un ruolo» — e
 * mandava al login chi aveva una sessione valida.
 *
 * Cosa sia transitorio lo decide chi chiama. Un'eccezione conta come
 * transitoria: si ritenta, e all'ultimo tentativo si rilancia.
 */
export async function conRiprova<T>(
  tentativo: () => Promise<T>,
  eTransitorio: (risultato: T) => boolean,
  attese: readonly number[],
  dormi: (ms: number) => Promise<void> = (ms) => new Promise((fine) => setTimeout(fine, ms)),
): Promise<T> {
  for (let i = 0; ; i++) {
    const ultimo = i >= attese.length;
    try {
      const risultato = await tentativo();
      if (ultimo || !eTransitorio(risultato)) return risultato;
    } catch (errore) {
      if (ultimo) throw errore;
    }
    await dormi(attese[i]);
  }
}
