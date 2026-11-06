import { supabase } from "@/integrations/supabase/client";
import { listRenderCatalogAssets, signRenderCatalogUrls } from "./renderCatalog";
import { makeReferenceImage } from "../../../shared/render-references/referenceUrl.ts";
import { roomVisualSignature, selectedRoomVisuals } from "../../../shared/render-references/roomVisualCatalog.ts";
import type { ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";

export interface CampioneTavola { id: string; label: string; url: string }
const PER_TAVOLA = 9;

function caricaFoto(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => ko(new Error("Un campione non si carica: riprova prima di generare il render.")), 15_000);
    img.onload = () => { window.clearTimeout(timer); ok(img); };
    img.onerror = () => { window.clearTimeout(timer); ko(new Error("Un campione non è disponibile: il render non è stato avviato.")); };
    img.src = url;
  });
}

/** Tutti i campioni entrano in massimo tre tavole; resta uno slot alla pianta della stanza. */
export async function disegnaTavoleMateriali(campioni: CampioneTavola[]): Promise<Blob[]> {
  if (campioni.length > 27) throw new Error("Troppi campioni per questo render: riduci le scelte e riprova.");
  const immagini = await Promise.all(campioni.map((c) => caricaFoto(c.url)));
  const tavole: Blob[] = [];
  for (let start = 0; start < campioni.length; start += PER_TAVOLA) {
    const gruppo = campioni.slice(start, start + PER_TAVOLA);
    const canvas = document.createElement("canvas");
    canvas.width = 1536;
    canvas.height = 64 + Math.ceil(gruppo.length / 3) * 528;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Questo browser non riesce a preparare i campioni del render.");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111827"; ctx.font = "bold 26px sans-serif";
    ctx.fillText(`SELECTED MATERIALS — BOARD ${tavole.length + 1}`, 20, 39);
    for (let i = 0; i < gruppo.length; i++) {
      const x = (i % 3) * 512 + 16, y = 64 + Math.floor(i / 3) * 528;
      const image = immagini[start + i];
      const scale = Math.min(480 / image.naturalWidth, 480 / image.naturalHeight);
      const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
      ctx.drawImage(image, x + (480 - w) / 2, y + (480 - h) / 2, w, h);
      ctx.fillStyle = "#111827"; ctx.font = "bold 17px sans-serif";
      const label = `${i + 1}. ${gruppo[i].label}`;
      ctx.fillText(label.slice(0, 48), x, y + 503, 480);
    }
    const blob = await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => b ? ok(b) : ko(new Error("Tavola campioni non creata.")), "image/jpeg", 0.91));
    if (blob.size > 4_000_000) throw new Error("Tavola materiali troppo grande: riduci i campioni.");
    tavole.push(blob);
  }
  return tavole;
}

export async function preparaMaterialiStanza(config: ConfigurazioneStanza, companyId: string): Promise<ConfigurazioneStanza> {
  const scelte = selectedRoomVisuals(config);
  const campioni: CampioneTavola[] = scelte.map((s) => ({ id: s.id, label: `${s.target}: ${s.label}`, url: makeReferenceImage(s.photo!.folder, s.photo!.filename, s.label).url }));
  const catalogoIds = [...new Set(config.catalogo_reference_ids ?? [])];
  if (catalogoIds.length) {
    const assets = await listRenderCatalogAssets(companyId, { verticale: "stanza" });
    const scelti = catalogoIds.map((id) => assets.find((a) => a.id === id));
    if (scelti.some((a) => !a)) throw new Error("Un prodotto del catalogo non è più disponibile: controlla la selezione.");
    const validi = scelti.filter((a): a is NonNullable<typeof a> => !!a);
    const urls = await signRenderCatalogUrls(validi.map((a) => a.storage_path));
    for (const a of validi) {
      const url = urls[a.storage_path];
      if (!url) throw new Error("Foto del catalogo non disponibile: riprova.");
      campioni.push({ id: `catalogo:${a.id}`, label: `CATALOG ${a.categoria}: ${a.etichetta}`, url });
    }
  }
  if (!campioni.length) return { ...config, materiali_visivi: undefined };
  const tavole = await disegnaTavoleMateriali(campioni);
  const lotto = crypto.randomUUID();
  const paths: string[] = [];
  try {
    for (let i = 0; i < tavole.length; i++) {
      const path = `${companyId}/materiali/${lotto}-${i}.jpg`;
      const { error } = await supabase.storage.from("stanza-originals").upload(path, tavole[i], { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error("Non riesco a salvare i campioni: il render non è stato avviato. Riprova.");
      paths.push(path);
    }
  } catch (error) {
    if (paths.length) await supabase.storage.from("stanza-originals").remove(paths);
    throw error;
  }
  return { ...config, materiali_visivi: { version: 1, signature: roomVisualSignature(config), paths, ids: campioni.map((c) => c.id) } };
}
