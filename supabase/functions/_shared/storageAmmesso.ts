/**
 * File di storage che una funzione può leggere con la chiave di servizio quando
 * bucket e percorso li sceglie chi chiama (30/10/2026).
 *
 * Il guaio: supabase-js attacca bucket e percorso all'indirizzo
 * `…/storage/v1/object/<bucket>/<percorso>` senza codificarli, e il parser degli
 * indirizzi legge `%2e%2e` come «sali di una cartella». Con la chiave di servizio,
 *   `<azienda>/%2e%2e/%2e%2e/%2e%2e/%2e%2e/rest/v1/<tabella>?select=*`
 * (o un bucket scritto allo stesso modo) fa uscire la richiesta dallo storage e la
 * manda alle API del database con i poteri del servizio. Un controllo
 * `startsWith("<azienda>/")` o `includes("..")` non se ne accorge: la funzione
 * passava il controllo e leggeva altro. Senza quel trucco, bucket e percorso liberi
 * volevano dire leggere (o farsi copiare) il file di un'altra azienda o un file
 * HR che la policy dello storage nega, conoscendo solo il nome.
 *
 * La regola, per le funzioni AI che ricevono `storage_bucket` e `storage_path`:
 *   1. il bucket deve avere un nome «normale» e il percorso nessun carattere che
 *      cambi l'indirizzo (`percorsoStorageSicuro`, la stessa regola del POS);
 *   2. la chiave di servizio si usa solo per le coppie (bucket, cartella) scritte
 *      qui sotto, che sono quelle che l'app carica davvero;
 *   3. tutto il resto si rifiuta, oppure (solo dove c'era già) si scarica con i
 *      diritti di chi chiama, che la RLS dello storage conosce.
 *
 * Aggiungere un bucket: va nell'elenco giusto QUI e il test
 * `src/test/security/funzioniAiBucketAmmessi.test.ts` lo confronta con quello che
 * le schermate dell'app mandano davvero.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Percorso di storage che arriva da una richiesta: niente `%`, `?`, `#`, `\`, né
 * caratteri di controllo o di inversione del testo, e nessun segmento vuoto, «.»
 * o «..». Stessa regola di `posPercorsi.ts` (ramo POS).
 */
export function percorsoStorageSicuro(path: unknown): path is string {
  return typeof path === "string" && path.length > 0 && path.length <= 1024
    && !/[\\%?#\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(path)
    && path.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

/** Nome di bucket come i 100 di produzione: minuscole, cifre, «-» e «_». Niente «/», «%», «.», «?». */
export function nomeBucketSicuro(bucket: unknown): bucket is string {
  return typeof bucket === "string" && /^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket);
}

export type CartellaAmmessa = "azienda" | "utente";

export interface BucketAmmesso {
  readonly bucket: string;
  /** La prima cartella del percorso: l'id dell'azienda e/o quello dell'utente che chiama. */
  readonly cartelle: readonly CartellaAmmessa[];
}

export type EsitoFile =
  | { ok: true; conChiaveDiServizio: boolean }
  | { ok: false; motivo: "bucket" | "percorso" };

/**
 * `ok: false` = bucket o percorso con una forma che non deve mai arrivare allo
 * storage (rispondere 400). `ok: true` con `conChiaveDiServizio: false` = forma
 * pulita ma fuori dalle coppie ammesse: rifiutare (403) oppure scaricare con i
 * diritti di chi chiama. Solo `conChiaveDiServizio: true` autorizza la chiave di servizio.
 */
export function valutaFile(
  file: { bucket: unknown; path: unknown },
  ammessi: readonly BucketAmmesso[],
  chi: { companyId: unknown; userId: unknown },
): EsitoFile {
  const { bucket, path } = file;
  if (!nomeBucketSicuro(bucket)) return { ok: false, motivo: "bucket" };
  if (!percorsoStorageSicuro(path)) return { ok: false, motivo: "percorso" };
  const regola = ammessi.find((r) => r.bucket === bucket);
  if (!regola) return { ok: true, conChiaveDiServizio: false };
  const nellaCartella = (id: unknown) =>
    typeof id === "string" && UUID.test(id) && path.length > id.length + 1 && path.startsWith(`${id}/`);
  const ammesso = regola.cartelle.some((c) => nellaCartella(c === "azienda" ? chi.companyId : chi.userId));
  return { ok: true, conChiaveDiServizio: ammesso };
}

/** ai-importa-condizioni: l'import delle condizioni nel modello preventivi carica qui. */
export const BUCKET_IMPORT_CONDIZIONI: readonly BucketAmmesso[] = [
  { bucket: "quote-template-assets", cartelle: ["azienda"] },
];

/**
 * Analisi dei documenti dal modale «Importa documento» (ai-document-analyzer, che
 * inoltra a document-ai-router, ddt-ai-extract e agli altri parser): il modale
 * carica in documenti-smart, e in computi se il primo manca.
 */
export const BUCKET_ANALISI_DOCUMENTI: readonly BucketAmmesso[] = [
  { bucket: "documenti-smart", cartelle: ["azienda"] },
  { bucket: "computi", cartelle: ["azienda"] },
];

/**
 * generic-doc-ai-extract: le analisi di sopra più i due chiamanti diretti
 * (import contratti di commessa e libretti dei mezzi). Fuori da qui scarica con
 * i diritti di chi chiama.
 */
export const BUCKET_LETTURA_GENERICA: readonly BucketAmmesso[] = [
  ...BUCKET_ANALISI_DOCUMENTI,
  { bucket: "order-attachments", cartelle: ["azienda"] },
  { bucket: "mezzi-documenti", cartelle: ["azienda"] },
];

/**
 * ai-fattura-ricevuta-ocr: la chat interna di Silvio carica in silvio-uploads
 * sotto l'id dell'utente (o dell'azienda), più le analisi dei documenti.
 */
export const BUCKET_OCR_FATTURA: readonly BucketAmmesso[] = [
  { bucket: "silvio-uploads", cartelle: ["utente", "azienda"] },
  ...BUCKET_ANALISI_DOCUMENTI,
];
