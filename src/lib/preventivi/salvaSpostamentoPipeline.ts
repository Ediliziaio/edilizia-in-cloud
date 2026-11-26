import { supabase } from "@/integrations/supabase/client";
import type { UnifiedRow, UnifiedStato } from "@/components/marketing/preventivi/UnifiedPreventiviList";
import { pianoSpostamentoPreventivo } from "./spostamentoPipeline";

/** Aggiorna soltanto la riga dell'azienda se ha ancora lo stato osservato. */
export async function salvaSpostamentoPreventivo(companyId: string, riga: UnifiedRow, destinazione: UnifiedStato) {
  const piano = pianoSpostamentoPreventivo(riga, destinazione);
  if (!companyId || !piano) throw new Error("Spostamento non disponibile");
  // Le tabelle dei moduli hanno generazioni di tipi diverse.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from(piano.tabella).update({ [piano.colonna]: piano.a })
    .eq("company_id", companyId).eq("id", riga.id).eq(piano.colonna, piano.da).is("deleted_at", null).select("id");
  if (error) throw new Error(error.message);
  if (data?.length !== 1) throw new Error("Lo stato è cambiato o non hai i permessi. Aggiorna l’elenco.");
}
