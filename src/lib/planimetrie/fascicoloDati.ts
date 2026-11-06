import { supabase } from "@/integrations/supabase/client";
import type { RenderDellaPianta } from "./render/renderDallaPianta";

/** Tutti i render del fascicolo, senza il limite di 60 miniature della galleria. */
export async function renderPerFascicolo(companyId: string, planimetriaId: string): Promise<RenderDellaPianta[]> {
  const out: RenderDellaPianta[] = [];
  for (let inizio = 0; ; inizio += 100) {
    const { data, error } = await supabase.from("render_stanza_sessions" as never)
      .select("id, status, result_urls, created_at, saved_to_gallery, planimetria:config->planimetria, scelte:config_snapshot->legacy_config" as never)
      .eq("company_id" as never, companyId as never)
      .eq("config->planimetria->>planimetria_id" as never, planimetriaId as never)
      .eq("status" as never, "completed" as never)
      .order("created_at", { ascending: true }).order("id", { ascending: true }).range(inizio, inizio + 99);
    if (error) throw new Error("Non riesco a leggere tutti i render del progetto: riprova prima di esportare.");
    const righe = (data ?? []) as unknown as RenderDellaPianta[];
    out.push(...righe);
    if (righe.length < 100) return out;
  }
}
