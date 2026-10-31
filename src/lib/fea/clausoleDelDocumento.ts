/**
 * Le clausole da approvare a parte (artt. 1341-1342 c.c.) lette dal PDF che parte in firma (31/10/2026).
 *
 * La pagina di firma mostrava clausole prese altrove (configurazione FEA o condizioni standard del settore),
 * mentre il PDF stampa quelle che l'azienda ha scritto nel modello o nel singolo preventivo: chi firmava
 * poteva approvare clausole diverse da quelle del suo contratto. Ora il documento, mentre si disegna,
 * dice quali clausole stampa nel riquadro «Approvazione specifica», e chi invia le passa al server.
 *
 * Funziona come un registro aperto solo durante `conClausoleDelDocumento`: fuori, `segnaClausoleDelDocumento`
 * non fa niente (anteprime, download). Se nello stesso intervallo si disegnano due documenti con clausole
 * diverse (un'anteprima che si aggiorna mentre si invia), non si indovina: si torna a null e vale la regola di prima.
 */
export interface ClausolaDelDocumento {
  id: string;
  testo: string;
}

let registro: string[][] | null = null;

/** Lo chiama il documento quando si disegna: le voci del riquadro «Approvazione specifica» ([] se non c'è). */
export function segnaClausoleDelDocumento(voci: readonly string[]): void {
  if (!registro) return;
  registro.push(voci.map((v) => String(v ?? "").trim()).filter(Boolean));
}

/** Esegue `genera` (il PDF per la firma) e restituisce anche le clausole che quel PDF stampa. */
export async function conClausoleDelDocumento<T>(genera: () => Promise<T>): Promise<{ risultato: T; clausole: ClausolaDelDocumento[] | null }> {
  const precedente = registro;
  const mio: string[][] = [];
  registro = mio;
  try {
    const risultato = await genera();
    return { risultato, clausole: clausoleDaRegistro(mio) };
  } finally {
    registro = precedente;
  }
}

/** Un solo elenco (anche ripetuto, se il documento si disegna due volte) → clausole; nessuno o più diversi → null. */
export function clausoleDaRegistro(elenchi: string[][]): ClausolaDelDocumento[] | null {
  if (elenchi.length === 0) return null;
  const chiave = (e: string[]) => JSON.stringify(e);
  const primo = elenchi[0];
  if (elenchi.some((e) => chiave(e) !== chiave(primo))) return null;
  return primo.map((testo, i) => ({ id: `doc-${i + 1}`, testo }));
}
