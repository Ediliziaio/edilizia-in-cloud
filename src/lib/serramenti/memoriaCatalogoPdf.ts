/**
 * memoriaCatalogoPdf.ts — le letture di listino che servono al PDF, tenute da
 * parte per un minuto (23/11/2026).
 *
 * Il pannello a destra del preventivatore rifà il PDF a ogni modifica (1,5 s
 * dopo l'ultimo tasto). Ogni giro rileggeva dal database l'intero contorno del
 * documento: prodotti, categorie, tipologie, variabili, linee fornitore,
 * schede tecniche, impostazioni. Sono una quindicina di letture in fila, una
 * dopo l'altra, e in produzione valgono quasi un secondo di attesa per giro —
 * ripetuto ogni volta che si tocca un campo. Misurato il 23/11/2026 su una
 * sessione vera: 164 letture di listino in due minuti e mezzo di lavoro, per
 * una dozzina di anteprime dello stesso preventivo.
 *
 * Il listino non cambia mentre si compila un preventivo, quindi l'anteprima
 * riusa quello che ha appena letto. Il documento vero — «Scarica», «Invia al
 * cliente», la firma — rilegge sempre tutto: lì conta l'ultimo dato, non la
 * velocità (`memoriaCatalogoPdf(true)` non tiene niente da parte).
 *
 * Si tengono solo le letture riuscite; un errore non resta in memoria.
 */
import { registraMemoria } from "@/lib/memorieDaSvuotare";

/** Un minuto: una modifica al listino si vede nell'anteprima entro il minuto. */
export const DURATA_MEMORIA_CATALOGO_MS = 60_000;

interface Voce {
  scade: number;
  valore: Promise<unknown>;
}

const VOCI = new Map<string, Voce>();

/** Per le prove e per il pulsante «svuota le memorie»: si riparte dal database. */
export function dimenticaCatalogoPdf(): void {
  VOCI.clear();
}
registraMemoria(dimenticaCatalogoPdf);

/** Legge, o restituisce quello che è stato letto poco fa con la stessa chiave. */
export type MemoriaCatalogo = <T>(chiave: string, leggi: () => Promise<T>) => Promise<T>;

const senzaMemoria: MemoriaCatalogo = (_chiave, leggi) => leggi();

/**
 * Una lettura andata male non si tiene da parte. Supabase non lancia: torna
 * `{ data: null, error }`, che è un risultato a tutti gli effetti. Senza questo
 * controllo, una lettura fallita si sarebbe ripetuta uguale per un minuto
 * invece di riprovare al giro dopo.
 */
function eAndataMale(valore: unknown): boolean {
  return typeof valore === "object" && valore !== null
    && "error" in valore && (valore as { error: unknown }).error != null;
}

/** Le voci scadute non si tolgono da sole: senza un tetto, una mattinata di preventivi le tiene tutte. */
const VOCI_MAX = 200;

function tieniDaParte(chiave: string, valore: Promise<unknown>, scade: number): void {
  if (VOCI.size >= VOCI_MAX) {
    const piuVecchia = VOCI.keys().next();
    if (!piuVecchia.done) VOCI.delete(piuVecchia.value);
  }
  VOCI.set(chiave, { scade, valore });
}

/**
 * @param documentoVero true per «Scarica»/«Invia»/firma: rilegge sempre tutto.
 */
export function memoriaCatalogoPdf(documentoVero: boolean): MemoriaCatalogo {
  if (documentoVero) return senzaMemoria;
  return <T>(chiave: string, leggi: () => Promise<T>): Promise<T> => {
    const ora = Date.now();
    const gia = VOCI.get(chiave);
    if (gia && gia.scade > ora) return gia.valore as Promise<T>;
    const valore = leggi().then(
      (letto) => {
        if (eAndataMale(letto)) VOCI.delete(chiave);
        return letto;
      },
      (errore) => {
        VOCI.delete(chiave);
        throw errore;
      },
    );
    tieniDaParte(chiave, valore, ora + DURATA_MEMORIA_CATALOGO_MS);
    return valore;
  };
}
