import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ImageReferenceInput } from "../_shared/ai-provider/image.ts";
import { roomVisualSignature, selectedRoomVisuals } from "../../../shared/render-references/roomVisualCatalog.ts";

export async function caricaTavoleMateriali(supabase: SupabaseClient, companyId: string, config: unknown): Promise<ImageReferenceInput[] | null> {
  const cfg = config && typeof config === "object" ? config as Record<string, unknown> : {};
  if (!cfg.materiali_visivi) return null; // compatibilità con le sessioni precedenti
  const board = cfg.materiali_visivi as Record<string, unknown>;
  const scelte = selectedRoomVisuals(cfg);
  const catalogo = Array.isArray(cfg.catalogo_reference_ids) ? [...new Set(cfg.catalogo_reference_ids.filter((x): x is string => typeof x === "string"))] : [];
  if (catalogo.length > 4) throw new Error("Troppi prodotti del catalogo.");
  const ids = [...scelte.map((s) => s.id), ...catalogo.map((id) => `catalogo:${id}`)];
  const paths = Array.isArray(board.paths) ? board.paths : [];
  if (board.version !== 1 || board.signature !== roomVisualSignature(cfg) || JSON.stringify(board.ids) !== JSON.stringify(ids) || !ids.length || paths.length !== Math.ceil(ids.length / 9) || paths.length > 3 || new Set(paths).size !== paths.length) {
    throw new Error("I campioni non corrispondono alle scelte attuali: riapri la configurazione e riprova.");
  }
  const prefix = `${companyId}/materiali/`;
  const references: ImageReferenceInput[] = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    if (typeof path !== "string" || !path.startsWith(prefix) || !/^[0-9a-f-]{36}-[0-2]\.jpg$/i.test(path.slice(prefix.length))) throw new Error("Campioni non validi per questa azienda.");
    const { data, error } = await supabase.storage.from("stanza-originals").download(path);
    if (error || !data || data.size < 1 || data.size > 4_000_000 || data.type !== "image/jpeg") throw new Error("Tavole materiali non disponibili: riprova prima di avviare il render.");
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error("La tavola materiali non è un’immagine JPEG valida.");
    let binary = "";
    for (let b = 0; b < bytes.length; b += 0x8000) binary += String.fromCharCode(...bytes.subarray(b, b + 0x8000));
    const legenda = ids.slice(i * 9, i * 9 + 9).map((id, j) => {
      const s = scelte.find((c) => c.id === id);
      return `${j + 1}. ${s ? `${s.target} — ${s.label}. ${s.instruction}` : `COMPANY CATALOG PRODUCT ${id}: copy the selected product shown in this panel, with priority over a generic sample for the same object.`}`;
    }).join("\n");
    references.push({ label: `SELECTED MATERIALS BOARD ${i + 1}: read its numbered panels. These are the EXACT samples selected by the customer. Never show the board, labels or thumbnails in the output; apply each sample only to its named target.\n${legenda}`, dataUrl: `data:image/jpeg;base64,${btoa(binary)}` });
  }
  return references;
}
