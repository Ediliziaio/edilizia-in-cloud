import { supabase } from "@/integrations/supabase/client";
import {
  normalizzaModelloPdf,
  type ModelloPdf,
  type TipoModelloPdf,
} from "./catalogo";
import type { Json } from "@/integrations/supabase/types";
export interface ModelloPdfSalvato {
  company_id: string;
  document_type: TipoModelloPdf;
  config: Json;
  updated_at: string;
}
const tabella = () => supabase.from("company_document_templates");
export async function leggiModelliPdf(
  companyId: string,
): Promise<ModelloPdfSalvato[]> {
  const { data, error } = await tabella()
    .select("company_id, document_type, config, updated_at")
    .eq("company_id", companyId);
  if (error)
    throw new Error(
      "Impossibile caricare i modelli PDF. Riprova prima di modificare o generare un documento.",
    );
  return (data ?? []) as unknown as ModelloPdfSalvato[];
}
export async function leggiModelloPdf(
  companyId: string,
  tipo: TipoModelloPdf,
): Promise<ModelloPdf> {
  const { data, error } = await tabella()
    .select("config")
    .eq("company_id", companyId)
    .eq("document_type", tipo)
    .maybeSingle();
  if (error)
    throw new Error(
      "Impossibile caricare il modello PDF dell’azienda. Riprova.",
    );
  return normalizzaModelloPdf(
    tipo,
    (data as unknown as { config: Json } | null)?.config,
  );
}
export async function salvaModelloPdf(
  companyId: string,
  tipo: TipoModelloPdf,
  config: ModelloPdf,
  versione: string | null,
): Promise<ModelloPdfSalvato> {
  const payload = {
    company_id: companyId,
    document_type: tipo,
    config: normalizzaModelloPdf(tipo, config) as unknown as Json,
    updated_at: new Date().toISOString(),
  };
  const request = versione
    ? tabella()
        .update(payload)
        .eq("company_id", companyId)
        .eq("document_type", tipo)
        .eq("updated_at", versione)
    : tabella().insert(payload);
  const { data, error } = await request
    .select("company_id, document_type, config, updated_at")
    .single();
  if (error || !data)
    throw new Error(
      error?.code === "23505" || error?.code === "PGRST116"
        ? "Il modello è stato aggiornato da un altro terminale. Ricarica i modelli prima di salvare."
        : "Modello non salvato. Le modifiche restano nell’editor: riprova.",
    );
  return data as unknown as ModelloPdfSalvato;
}
