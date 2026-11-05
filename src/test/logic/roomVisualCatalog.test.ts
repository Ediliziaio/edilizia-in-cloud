import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { ROOM_VISUAL_LABELS, roomVisualChoices, roomVisualSignature, selectedRoomVisuals, type RoomVisualGroup } from "../../../shared/render-references/roomVisualCatalog.ts";
import { thumbPath } from "../../../shared/render-references/thumbs.ts";
import { caricaTavoleMateriali } from "../../../supabase/functions/generate-room-render/materiali.ts";
import { normalizeRoomFloorConfig, qualitaImmagineStanza } from "../../../shared/render-room/roomRenderConfig.ts";

const company = "11111111-1111-4111-8111-111111111111";
const batch = "22222222-2222-4222-8222-222222222222";
const configurazione = () => ({ tipo_stanza: "cucina", stile_target: "moderno", intensita: "medio", pavimento: { attivo: true, tipo: "gres_porcellanato", effetto_visivo: "legno", essenza_legno: "noce", pattern: "esagonale", finitura: "opaco" }, arredo: { attivo: true, materiale: "pelle", intensita_cambio: "arredo_completo" }, verniciatura: { attivo: true, finitura: "opaco", colore_hex: "#AABBCC" }, carta_da_parati: { attivo: true, stile_pattern: "botanico" }, rivestimento_pareti: { attivo: true, tipo: "boiserie_legno" }, soffitto: { attivo: true, tipo: "travi_legno" }, illuminazione: { attivo: true, tipo: "applique_parete" }, tende: { attivo: true, tipo: "tende_lino" }, restyling_cucina: { attivo: true, materiale_frontali: "legno", piano_lavoro_materiale: "quarzo", maniglie: "metallo_nero" } });

describe("catalogo fotografico completo", () => {
  it("la qualità Alta usa high; le configurazioni precedenti e i valori sconosciuti mantengono medium", () => {
    expect(qualitaImmagineStanza({ qualita_render: "alta" })).toBe("high");
    expect(qualitaImmagineStanza({})).toBe("medium");
    expect(qualitaImmagineStanza({ qualita_render: "valore_sconosciuto" })).toBe("medium");
  });
  it("le configurazioni precedenti senza valori opzionali usano gli stessi campioni predefiniti del modulo", () => {
    const ids = selectedRoomVisuals({ tipo_stanza: "cucina", verniciatura: { attivo: true }, arredo: { attivo: true }, soffitto: { attivo: true }, illuminazione: { attivo: true }, carta_da_parati: { attivo: true }, rivestimento_pareti: { attivo: true }, tende: { attivo: true }, restyling_cucina: { attivo: true } }).map((s) => s.id);
    for (const id of ["style:moderno", "paint_finish:satinato", "furniture_material:legno_chiaro", "ceiling_type:piano", "lighting_type:misto", "wallpaper_pattern:geometrico", "cladding_type:boiserie_legno", "curtain_type:tende_classiche", "kitchen_front:laccato", "kitchen_worktop:quarzo", "kitchen_handle:senza_maniglia"]) expect(ids).toContain(id);
  });
  it("ogni scelta fisica ha la foto del motore e la miniatura, nessun quadrato vuoto", () => {
    for (const group of Object.keys(ROOM_VISUAL_LABELS) as RoomVisualGroup[]) {
      for (const c of roomVisualChoices(group, configurazione())) {
        if (c.removal) continue;
        expect(c.photo, `${group}:${c.value}`).toBeDefined();
        expect(existsSync(join(process.cwd(), "public/render-references", c.photo!.folder, c.photo!.filename)), `${group}:${c.value}`).toBe(true);
        expect(existsSync(join(process.cwd(), "public/render-references", thumbPath(c.photo!.folder, c.photo!.filename))), `${group}:${c.value} thumb`).toBe(true);
      }
    }
  });

  it("non scarta carta, arredi, soffitto, luci, tende e cucina quando il pavimento occupa già tre reference", () => {
    const ids = selectedRoomVisuals(configurazione()).map((s) => s.id);
    for (const id of ["wallpaper_pattern:botanico", "furniture_material:pelle", "ceiling_type:travi_legno", "lighting_type:applique_parete", "curtain_type:tende_lino", "kitchen_front:legno", "kitchen_worktop:quarzo", "kitchen_handle:metallo_nero"]) expect(ids).toContain(id);
    expect(ids.length).toBeGreaterThan(9);
  });

  it("non invia oggetti disattivati, tende da rimuovere o un nuovo materiale se si cambia solo il colore", () => {
    const c = configurazione();
    c.carta_da_parati.attivo = false;
    c.arredo.intensita_cambio = "colore_sola";
    c.tende.tipo = "nessuna";
    const ids = selectedRoomVisuals(c).map((s) => s.id);
    expect(ids.some((id) => id.startsWith("wallpaper_pattern:"))).toBe(false);
    expect(ids.some((id) => id.startsWith("furniture_material:"))).toBe(false);
    expect(ids.some((id) => id.startsWith("curtain_type:"))).toBe(false);
  });

  it("la firma cambia cambiando motivo o colore, ma non aggiungendo il riferimento alle tavole", () => {
    const c = configurazione(), prima = roomVisualSignature(c);
    expect(roomVisualSignature({ ...c, materiali_visivi: { paths: ["x"] } })).toBe(prima);
    expect(roomVisualSignature({ ...c, carta_da_parati: { ...c.carta_da_parati, stile_pattern: "righe" } })).not.toBe(prima);
    expect(roomVisualSignature({ ...c, verniciatura: { ...c.verniciatura, colore_hex: "#001122" } })).not.toBe(prima);
  });
  it("il microcemento resta una superficie continua anche nel prompt, senza diventare gres", () => {
    expect(normalizeRoomFloorConfig({ tipo: "microcemento" }).tipo).toBe("microcemento");
    const c = configurazione();
    c.pavimento.tipo = "microcemento";
    expect(selectedRoomVisuals(c).some((s) => s.group === "floor_pattern")).toBe(false);
  });
  it("il mosaico mostra piccole tessere, non il campione di grandi piastrelle in cemento", () => {
    const c = configurazione();
    c.pavimento.tipo = "mosaico";
    const scelte = selectedRoomVisuals(c);
    const superficie = scelte.find((s) => s.group === "floor_type")!;
    expect(superficie.photo!.filename).toBe("Mosaico-Esagonale-Bianco-Lucido.webp");
    expect(superficie.instruction).toContain("NEVER one tessera");
    expect(scelte.some((s) => s.group === "floor_pattern")).toBe(false);
  });
});

function pronto() {
  const cfg = configurazione();
  const ids = selectedRoomVisuals(cfg).map((s) => s.id);
  return { ...cfg, materiali_visivi: { version: 1, signature: roomVisualSignature(cfg), ids, paths: Array.from({ length: Math.ceil(ids.length / 9) }, (_, i) => `${company}/materiali/${batch}-${i}.jpg`) } };
}

describe("tavole selezionate: server e isolamento aziendale", () => {
  const fake = () => {
    const download = vi.fn(async () => ({ data: new NodeBlob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }), error: null }));
    return { client: { storage: { from: vi.fn(() => ({ download })) } }, download };
  };
  it("carica tutte le tavole e include ogni pannello nella legenda", async () => {
    const f = fake(), cfg = pronto();
    const result = await caricaTavoleMateriali(f.client as never, company, cfg);
    expect(result).toHaveLength(cfg.materiali_visivi.paths.length);
    const testo = result!.map((r) => r.label).join("\n");
    expect(testo).toContain("WALLPAPER");
    expect(testo).toContain("FURNITURE MATERIAL");
    expect(testo).toContain("KITCHEN WORKTOP");
  });
  it("ferma tavole di un'altra azienda prima di scaricarle", async () => {
    const f = fake(), cfg = pronto();
    cfg.materiali_visivi.paths[0] = `altra-azienda/materiali/${batch}-0.jpg`;
    await expect(caricaTavoleMateriali(f.client as never, company, cfg)).rejects.toThrow("questa azienda");
    expect(f.download).not.toHaveBeenCalled();
  });
  it("rifiuta tavole vecchie dopo il cambio di una scelta e non perde pannelli in silenzio", async () => {
    const f = fake(), cfg = pronto();
    cfg.carta_da_parati.stile_pattern = "righe";
    await expect(caricaTavoleMateriali(f.client as never, company, cfg)).rejects.toThrow("scelte attuali");
    expect(f.download).not.toHaveBeenCalled();
  });
  it("un file mancante ferma il render, anziché far inventare il materiale", async () => {
    const download = vi.fn(async () => ({ data: null, error: { message: "missing" } }));
    await expect(caricaTavoleMateriali({ storage: { from: () => ({ download }) } } as never, company, pronto())).rejects.toThrow("Tavole materiali non disponibili");
  });
  it("la verifica precede l'addebito nel flusso di produzione", () => {
    const src = readFileSync(join(process.cwd(), "supabase/functions/generate-room-render/index.ts"), "utf8");
    expect(src.indexOf("await caricaTavoleMateriali(")).toBeLessThan(src.indexOf("await deductRenderCreditSafe("));
  });
  it("un errore iniziale chiude solo la sessione autorizzata e non rilegge il body già consumato", () => {
    const src = readFileSync(join(process.cwd(), "supabase/functions/generate-room-render/index.ts"), "utf8");
    expect(src).not.toContain("req.clone()");
    expect(src).toContain("if (sessionAutorizzata && refundableSessionId && refundableCompanyId)");
    expect(src.indexOf("sessionAutorizzata = true")).toBeGreaterThan(src.indexOf("if (!allowed)"));
    expect(src).toMatch(/\.eq\("id", refundableSessionId\)\s*\.eq\("company_id", refundableCompanyId\)/);
  });
});
