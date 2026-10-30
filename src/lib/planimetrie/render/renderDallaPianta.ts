/**
 * Render AI dalla pianta (fase 5b), lato browser.
 *
 * - Il riferimento alla stanza sta in `render_stanza_sessions.config.planimetria`
 *   (lo legge `generate-room-render`, che rilegge la pianta dal database); la
 *   migrazione 20281030291000 lo copia anche in colonne indicizzate. Le letture qui
 *   filtrano sul config, così funzionano prima e dopo la migrazione.
 * - La pianta della stanza (SVG di shared/render-planimetria) diventa un PNG da allegare.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { TipoStanza } from "@/modules/render-stanza/lib/types";
import type { Destinazione } from "../../../../shared/planimetrie/modello.ts";
import type { AperturaInquadrata, PartenzaRender } from "../../../../shared/render-planimetria/prompt.ts";
import type { RiferimentoStanza } from "../../../../shared/render-planimetria/vincoli.ts";

/** Ciò che finisce in `config.planimetria` della sessione. */
export interface PlanimetriaNelRender extends RiferimentoStanza {
  partenza: PartenzaRender;
  /** Aperture inquadrate dalla vista del 3D (solo con partenza «vista_3d»). */
  inquadrate?: AperturaInquadrata[];
  /** PNG della pianta della stanza, nel contenitore «stanza-originals». */
  pianta_path?: string | null;
  /** Per mostrarlo nelle gallerie senza riaprire la pianta. */
  locale_nome?: string;
}

export interface RenderDellaPianta {
  id: string;
  status: string;
  result_urls: string[] | null;
  created_at: string;
  saved_to_gallery: boolean | null;
  planimetria: PlanimetriaNelRender | null;
}

/** Dalla destinazione del locale al «tipo di stanza» del render. */
export function tipoStanzaDaDestinazione(d: Destinazione | string): TipoStanza {
  switch (d) {
    case "cucina": return "cucina";
    case "soggiorno": return "soggiorno";
    case "camera": return "camera_da_letto";
    case "bagno": return "bagno";
    case "studio": return "studio";
    case "ingresso": return "ingresso";
    case "corridoio":
    case "disimpegno": return "corridoio";
    case "cantina": return "taverna";
    default: return "altro";
  }
}

export const chiaviRenderPianta = {
  dellaPianta: (planimetriaId: string | null | undefined, companyId?: string | null) =>
    companyId === undefined ? ["planimetrie", "render", planimetriaId] as const : ["planimetrie", "render", planimetriaId, companyId] as const,
};

export async function elencaRenderDellaPianta(companyId: string, planimetriaId: string): Promise<RenderDellaPianta[]> {
  const { data, error } = await supabase
    .from("render_stanza_sessions" as never)
    .select("id, status, result_urls, created_at, saved_to_gallery, planimetria:config->planimetria" as never)
    .eq("company_id" as never, companyId as never)
    .eq("config->planimetria->>planimetria_id" as never, planimetriaId as never)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error("Render della pianta non disponibili: riprova tra qualche secondo.");
  return (data ?? []) as unknown as RenderDellaPianta[];
}

export function useRenderDellaPianta(planimetriaId: string | null | undefined) {
  const companyId = useAuth().effectiveCompany?.id ?? null;
  return useQuery({
    queryKey: chiaviRenderPianta.dellaPianta(planimetriaId, companyId),
    enabled: !!planimetriaId && !!companyId,
    queryFn: () => elencaRenderDellaPianta(companyId!, planimetriaId!),
  });
}

/** Da SVG a PNG nel browser (per allegare la pianta della stanza al render). */
export async function pngDaSvg(svg: string, lato = 1024): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok();
      img.onerror = () => ko(new Error("Pianta della stanza non disegnata."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = lato;
    canvas.height = lato;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Pianta della stanza non disegnata.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lato, lato);
    ctx.drawImage(img, 0, 0, lato, lato);
    return await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Pianta della stanza non disegnata."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
