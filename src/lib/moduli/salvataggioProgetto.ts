/**
 * Salvataggio dei progetti degli otto moduli di preventivo: ristrutturazione,
 * bagni, tetti, climatizzazione, elettrico, termoidraulico, pavimenti, piscine.
 *
 * Il wizard tiene in memoria la riga intera del progetto e la rimanda a ogni
 * autosave. Da qui le regole comuni agli otto hook `use<Modulo>Progetto`:
 *  - il form non scrive le colonne del server: un `totale: 0` rimasto in
 *    memoria cancellava i totali appena salvati dal computo, e uno `stato`
 *    vecchio riportava indietro quello cambiato da un altro flusso;
 *  - i salvataggi dello stesso progetto passano uno alla volta: due salvataggi
 *    del computo sovrapposti duplicavano le righe.
 */

/** Colonne dei progetti che il form del wizard non scrive mai. */
export const COLONNE_DEL_SERVER = [
  "id",
  "company_id",
  "code",
  "stato",
  "ordine_id",
  "totale",
  "totale_imponibile",
  "totale_iva",
  "created_at",
  "created_by",
  "updated_at",
  "deleted_at",
] as const;

const DEL_SERVER: ReadonlySet<string> = new Set(COLONNE_DEL_SERVER);

/** Il patch del form senza le colonne che decide il server. */
export function soloCampiDelForm<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([colonna]) => !DEL_SERVER.has(colonna)),
  ) as Partial<T>;
}

/** Il patch cambia sconto o IVA, e con loro i totali salvati sul progetto? */
export function cambiaITotali(patch: { sconto_pct?: unknown; iva_pct?: unknown }): boolean {
  return patch.sconto_pct !== undefined || patch.iva_pct !== undefined;
}

const inCorso = new Map<string, Promise<void>>();

/**
 * Esegue `lavoro` dopo i salvataggi già partiti con la stessa chiave (l'id del
 * progetto). Un salvataggio fallito non blocca quelli che aspettano.
 */
export function inFila<T>(chiave: string, lavoro: () => Promise<T>): Promise<T> {
  const precedente = inCorso.get(chiave) ?? Promise.resolve();
  const questo = precedente.then(() => lavoro());
  const fine = questo.then(
    () => undefined,
    () => undefined,
  );
  inCorso.set(chiave, fine);
  void fine.then(() => {
    if (inCorso.get(chiave) === fine) inCorso.delete(chiave);
  });
  return questo;
}

/** Divide un elenco in lotti della dimensione data (l'ultimo può essere più corto). */
export function aLotti<T>(elenco: readonly T[], dimensione: number): T[][] {
  const passo = Math.max(1, Math.floor(dimensione) || 1);
  const lotti: T[][] = [];
  for (let i = 0; i < elenco.length; i += passo) lotti.push(elenco.slice(i, i + passo));
  return lotti;
}
