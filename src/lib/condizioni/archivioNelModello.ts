/**
 * Appoggia sul modello del PDF quello che serve dall'archivio «Contratti e condizioni» (07/11/2026).
 *
 * Il PDF di un preventivatore si costruisce dal suo modello (`*_template_pdf`, o la copia congelata nel
 * preventivo). Le condizioni però si scrivono una volta sola, nell'archivio: qui si leggono e si mettono
 * sul modello sotto `__condizioni_archivio`, dove `leggiModello` (adattatoreEdile) le trova. Chi arriva
 * al documento per altre strade non cambia firma.
 *
 * Non scrive niente e non toglie niente: il testo che il modello aveva resta lì, e vale finché l'azienda
 * non ha un modello nell'archivio (regola in `condizioniDelPdf`).
 */
import { registraMemoria } from "@/lib/memorieDaSvuotare";
import { supabase } from "@/integrations/supabase/client";
import { CHIAVE_ARCHIVIO, caricaArchivioDelDocumento, type ArchivioDelDocumento } from "../../../supabase/functions/_shared/condizioniArchivio";

/**
 * L'archivio letto da poco, per un minuto (07/11/2026). Il PDF vero a destra del wizard si rifà a ogni modifica:
 * senza questa memoria ogni giro rileggeva i modelli dal database. Un minuto basta perché un modello cambiato
 * in «Contratti e condizioni» arrivi nel preventivo aperto senza ricaricare la pagina.
 */
const LETTI = new Map<string, { quando: number; archivio: Promise<ArchivioDelDocumento> }>();
export const DURATA_ARCHIVIO_MS = 60_000;

/** Per le prove e dopo un salvataggio in «Contratti e condizioni»: si rilegge alla prossima richiesta. */
export function dimenticaArchivioLetto(): void { LETTI.clear(); }
registraMemoria(dimenticaArchivioLetto);

export async function conArchivioDelDocumento<T extends object>(
  template: T,
  documento: { company_id?: string | null; condizioni_origine?: unknown } | null | undefined,
): Promise<T> {
  const t = template as Record<string, unknown>;
  // Già appoggiato da chi ha un database a portata (il server del bot): non si rilegge.
  if (t[CHIAVE_ARCHIVIO]) return template;
  const companyId = documento?.company_id ?? (typeof t.company_id === "string" ? t.company_id : null);
  const associatoId = typeof t.condizioni_modello_id === "string" ? t.condizioni_modello_id : null;
  const chiave = JSON.stringify([companyId, associatoId, documento?.condizioni_origine ?? null]);
  const ora = Date.now();
  let letto = LETTI.get(chiave);
  if (!letto || ora - letto.quando > DURATA_ARCHIVIO_MS) {
    letto = {
      quando: ora,
      archivio: caricaArchivioDelDocumento(supabase, companyId, { ambito: "preventivo", associatoId, origine: documento?.condizioni_origine }),
    };
    LETTI.set(chiave, letto);
  }
  const archivio = await letto.archivio;
  return { ...template, [CHIAVE_ARCHIVIO]: archivio } as T;
}
