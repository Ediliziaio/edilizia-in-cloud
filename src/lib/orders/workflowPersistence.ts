import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { orderWorkflowModel } from "./workflowModels";

/** One scoped optimistic update. Does not change status, phases, costs or CRM outcomes. */
export async function saveOrderWorkflow(client: SupabaseClient<Database>, input: {orderId: string; companyId: string; version: number; modelKey: string | null}) {
  if (!input.orderId || !input.companyId || !Number.isInteger(input.version) || input.version < 1 || (input.modelKey !== null && !orderWorkflowModel(input.modelKey))) throw new Error("Commessa, versione o percorso non validi.");
  const {data, error} = await client.from("orders").update({tipo_lavoro: input.modelKey}).eq("id", input.orderId).eq("company_id", input.companyId).eq("version", input.version).select("id, tipo_lavoro, version").maybeSingle();
  if (error) throw new Error("Percorso non salvato. Ricarica la commessa e riprova.");
  if (!data || data.id !== input.orderId || data.tipo_lavoro !== input.modelKey || !Number.isInteger(data.version) || data.version <= input.version) throw new Error("Salvataggio non confermato: la commessa può essere cambiata in un'altra sessione o non hai accesso. Ricarica prima di riprovare.");
  return data;
}
