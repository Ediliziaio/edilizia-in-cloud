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
import { supabase } from "@/integrations/supabase/client";
import { CHIAVE_ARCHIVIO, caricaArchivioDelDocumento } from "../../../supabase/functions/_shared/condizioniArchivio";

export async function conArchivioDelDocumento<T extends object>(
  template: T,
  documento: { company_id?: string | null; condizioni_origine?: unknown } | null | undefined,
): Promise<T> {
  const t = template as Record<string, unknown>;
  // Già appoggiato da chi ha un database a portata (il server del bot): non si rilegge.
  if (t[CHIAVE_ARCHIVIO]) return template;
  const companyId = documento?.company_id ?? (typeof t.company_id === "string" ? t.company_id : null);
  const archivio = await caricaArchivioDelDocumento(supabase, companyId, {
    ambito: "preventivo",
    associatoId: typeof t.condizioni_modello_id === "string" ? t.condizioni_modello_id : null,
    origine: documento?.condizioni_origine,
  });
  return { ...template, [CHIAVE_ARCHIVIO]: archivio } as T;
}
