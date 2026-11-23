/**
 * chiaveAnteprimaPdf.ts — quando il PDF a lato del preventivatore si rifà
 * (23/11/2026).
 *
 * `AnteprimaPdfVero` rigenera il documento ogni volta che la sua `chiave`
 * cambia. Prendere il preventivo così com'è e passarlo da `JSON.stringify`
 * fa cambiare la chiave anche quando nel PDF non cambia niente:
 *
 *  - `updated_at` si riscrive a ogni salvataggio automatico (ogni due secondi
 *    di digitazione), e dopo ogni salvataggio il preventivo viene riletto;
 *  - i link delle foto sono firmati e la firma è nuova a ogni rilettura, anche
 *    se la foto è la stessa.
 *
 * Risultato: il PDF si rifaceva daccapo — una quindicina di letture di
 * listino, il disegno di tutte le pagine — per modifiche che nel documento
 * non si vedono. Qui si toglie quel rumore: restano solo i dati che il
 * cliente vede stampati.
 *
 * Il preventivatore edile faceva già metà di questo lavoro a mano
 * (`SENZA_TIMBRI`); questa è la stessa regola, scritta una volta sola.
 */

/**
 * Campi di servizio: cambiano da soli e nel PDF non compaiono.
 * `created_at` invece resta: il documento stampa la data del preventivo.
 */
const CAMPI_DI_SERVIZIO = new Set([
  "updated_at",
  "pdf_url",
  "pdf_html_url",
  "pdf_generated_at",
]);

/** Il link di una foto senza la firma: lo stesso file ha sempre la stessa chiave. */
function senzaFirma(valore: string): string {
  if (!/^https?:\/\//i.test(valore) || !valore.includes("token=")) return valore;
  try {
    const indirizzo = new URL(valore);
    indirizzo.searchParams.delete("token");
    return indirizzo.toString();
  } catch {
    return valore;
  }
}

/**
 * La chiave di `AnteprimaPdfVero` per i dati di un preventivo: cambia solo
 * quando cambia qualcosa che finisce davvero nel PDF.
 */
export function chiaveAnteprimaPdf(dati: unknown): string {
  return JSON.stringify(dati, (chiave, valore) => {
    if (CAMPI_DI_SERVIZIO.has(chiave)) return undefined;
    if (typeof valore === "string") return senzaFirma(valore);
    return valore;
  }) ?? "";
}
