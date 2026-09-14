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
 *    del computo sovrapposti duplicavano le righe;
 *  - un progetto nuovo parte con IVA e detrazione predefinite dall'azienda nel
 *    template del modulo: prima prendeva i default della tabella.
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
    (): void => undefined,
    (): void => undefined,
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

/** Predefiniti del template PDF dell'azienda, come stanno sul DB. */
export interface PredefinitiAzienda {
  default_iva_pct?: number | string | null;
  default_detrazione_pct?: number | string | null;
}

const percentuale = (valore: unknown): number | undefined => {
  if (valore === null || valore === undefined || valore === "") return undefined;
  const n = Number(valore);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
};

/**
 * IVA e detrazione di un progetto nuovo. Resta quello che chi crea ha già
 * scelto (anche lo zero); il resto arriva dal template dell'azienda. Senza
 * template, o con un valore vuoto o fuori scala, non si aggiunge nulla e
 * decidono i default della tabella.
 */
export function condizioniDiPartenza(
  scelte: { iva_pct?: number | null; detrazione_pct?: number | null },
  azienda: PredefinitiAzienda | null | undefined,
): { iva_pct?: number; detrazione_pct?: number } {
  const condizioni: { iva_pct?: number; detrazione_pct?: number } = {};
  const iva = percentuale(azienda?.default_iva_pct);
  const detrazione = percentuale(azienda?.default_detrazione_pct);
  if (scelte.iva_pct == null && iva !== undefined) condizioni.iva_pct = iva;
  if (scelte.detrazione_pct == null && detrazione !== undefined) condizioni.detrazione_pct = detrazione;
  return condizioni;
}
