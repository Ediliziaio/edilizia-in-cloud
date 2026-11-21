import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

export type ChecklistDaSalvare = TablesInsert<"checklist_sicurezza"> & {
  data: string;
  turno: string;
  revisione_base?: string | null;
};

const CONFLITTO_CHECKLIST = "Una checklist più recente è già sul server.";

export async function salvaChecklistSicurezza(payload: ChecklistDaSalvare, nuovoId: string) {
  const { revisione_base, id: _id, created_at: _creata, updated_at: _aggiornata, ...valori } = payload;
  if (!revisione_base) {
    const { error } = await supabase.from("checklist_sicurezza").insert({ ...valori, id: nuovoId });
    if (!error || error.code !== "23505") return error;
    // Se la risposta alla prima creazione è andata persa, la riga porta ancora lo stesso ID.
    const ricevuta = await supabase.from("checklist_sicurezza").select("id")
      .eq("id", nuovoId).eq("company_id", valori.company_id).eq("operaio_id", valori.operaio_id)
      .maybeSingle();
    if (ricevuta.error) return ricevuta.error;
    if (ricevuta.data) return null;
  } else {
    const { data, error } = await supabase.from("checklist_sicurezza").update(valori)
      .eq("company_id", valori.company_id).eq("operaio_id", valori.operaio_id)
      .eq("data", valori.data).eq("turno", valori.turno).eq("updated_at", revisione_base)
      .select("id").maybeSingle();
    if (error || data) return error;
  }
  return { code: "PT409", message: CONFLITTO_CHECKLIST };
}
