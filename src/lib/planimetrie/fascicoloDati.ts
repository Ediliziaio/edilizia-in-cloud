import { supabase } from "@/integrations/supabase/client";
import type { RenderDellaPianta } from "./render/renderDallaPianta";
import { caricaLogo } from "./esporta/cartiglio";

/** Tutti i render del fascicolo, senza il limite di 60 miniature della galleria. */
export async function renderPerFascicolo(companyId: string, planimetriaId: string): Promise<RenderDellaPianta[]> {
  const out: RenderDellaPianta[] = [];
  for (let inizio = 0; ; inizio += 100) {
    const { data, error } = await supabase.from("render_stanza_sessions" as never)
      .select("id, status, result_urls, original_photo_url, created_at, saved_to_gallery, planimetria:config->planimetria, scelte:config_snapshot->legacy_config" as never)
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

/** La sorgente esatta del render resta privata: nel PDF entra l'immagine, mai il link firmato. */
export async function sorgentePerFascicolo(companyId: string, percorso: string | null | undefined): Promise<Uint8Array | null> {
  if (!percorso) return null;
  if (!percorso.startsWith(`${companyId}/`) || percorso.includes("..")) throw new Error("Foto di partenza non disponibile per questa azienda.");
  const { data, error } = await supabase.storage.from("stanza-originals").createSignedUrl(percorso, 600);
  if (error || !data?.signedUrl) throw new Error("La foto di partenza del render non è disponibile: riprova l'esportazione.");
  const foto = await caricaLogo(data.signedUrl, 20_000);
  if (!foto) throw new Error("Non riesco a leggere la foto di partenza del render: riprova l'esportazione.");
  return foto.dati;
}

/** Per i prodotti aziendali si conserva la tavola fotografica usata allora, anche se il catalogo cambia. */
export async function campioniPersonaliPerFascicolo(companyId: string, config: Record<string, unknown> | null | undefined): Promise<Uint8Array[]> {
  if (!Array.isArray(config?.catalogo_reference_ids) || !config.catalogo_reference_ids.length) return [];
  const board = config.materiali_visivi as { paths?: unknown } | undefined;
  const paths = board?.paths;
  if (!Array.isArray(paths) || !paths.length || paths.length > 3 || paths.some((p) => typeof p !== "string" || !p.startsWith(`${companyId}/materiali/`) || p.includes(".."))) throw new Error("I campioni personali di questo render non sono disponibili: controlla le immagini prima di esportare.");
  const immagini: Uint8Array[] = [];
  for (const path of paths) {
    const foto = await sorgentePerFascicolo(companyId, path);
    if (!foto) throw new Error("Un campione personale non è disponibile.");
    immagini.push(foto);
  }
  return immagini;
}
