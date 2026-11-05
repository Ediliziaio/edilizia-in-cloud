import { normalizeRoomFloorConfig } from "../render-room/roomRenderConfig.ts";
import { FLOOR_EFFECT_PHOTOS, FLOOR_ESSENCE_PHOTOS, FLOOR_FINISH_PHOTOS, FLOOR_LAYOUT_PHOTOS, FLOOR_SKIRTING_PHOTOS, floorSurfacePhoto } from "./floorReferences.ts";
import { ROOM_CLADDING_PHOTOS, ROOM_LIGHTING_PHOTOS } from "./roomReferences.ts";
import { ROOM_VISUAL_PHOTOS } from "./roomVisualPhotos.ts";
import { TILE_EFFECT_PHOTOS } from "./bathroomReferences.ts";
import type { PhotoEntry, PhotoTable } from "./referencePicker.ts";

export type RoomVisualGroup = "style" | "paint_finish" | "floor_type" | "floor_effect" | "floor_essence" | "floor_pattern" | "floor_finish" | "floor_skirting" | "furniture_material" | "ceiling_type" | "lighting_type" | "wallpaper_pattern" | "cladding_type" | "curtain_type" | "kitchen_front" | "kitchen_worktop" | "kitchen_handle";
export interface RoomVisualChoice { value: string; label: string; photo?: PhotoEntry; removal?: boolean }
export interface RoomVisualSelection extends RoomVisualChoice { id: string; group: RoomVisualGroup; target: string; instruction: string }
export interface RoomVisualBoards { version: 1; signature: string; paths: string[]; ids: string[] }

export const ROOM_VISUAL_LABELS: Record<RoomVisualGroup, Record<string, string>> = {
  style: { moderno: "Moderno", scandinavo: "Scandinavo", industriale: "Industriale", classico: "Classico", rustico: "Rustico", minimalista: "Minimalista", mediterraneo: "Mediterraneo", art_deco: "Art Deco", giapponese: "Giapponese", provenzale: "Provenzale", eclettico: "Eclettico", luxe_contemporaneo: "Luxe contemporaneo" },
  paint_finish: { opaco: "Opaco", satinato: "Satinato", lucido: "Lucido", lavabile: "Lavabile" },
  floor_type: { gres_porcellanato: "Gres porcellanato", parquet_legno: "Parquet legno", parquet_laminato: "Laminato effetto legno", vinile_lvt: "Vinile LVT/SPC", cotto: "Cotto", marmo: "Marmo", resina: "Resina", cemento_spatolato: "Cemento spatolato", microcemento: "Microcemento", moquette: "Moquette", terrazzo_veneziano: "Terrazzo veneziano", mosaico: "Mosaico", pietra_naturale: "Pietra naturale" },
  floor_effect: { legno: "Legno", marmo: "Marmo", pietra: "Pietra", cemento: "Cemento", resina: "Resina continua", cotto: "Cotto", tessile: "Tessile", terrazzo: "Terrazzo" },
  floor_essence: { rovere_naturale: "Rovere naturale", rovere_sbiancato: "Rovere sbiancato", rovere_miele: "Rovere miele", noce: "Noce", teak: "Teak", wenghe: "Wenge", frassino_bianco: "Frassino bianco" },
  floor_pattern: { dritto: "Dritto", diagonale: "Diagonale", spina_pesce: "Spina di pesce", spina_ungherese: "Spina ungherese", cassero_regolare: "Cassero regolare", cassero_irregolare: "Cassero irregolare", opus_romano: "Opus romano", sfalsato_33: "Sfalsato 33%", modulare: "Modulare", esagonale: "Esagonale" },
  floor_finish: { opaco: "Opaco", satinato: "Satinato", lucido: "Lucido", levigato: "Levigato", strutturato: "Strutturato", spazzolato: "Spazzolato", naturale: "Naturale" },
  floor_skirting: { coordinato_pavimento: "Coordinato al pavimento", bianco: "Bianco", legno: "Legno", alluminio: "Alluminio" },
  furniture_material: { legno_chiaro: "Legno chiaro", legno_scuro: "Legno scuro", metallo: "Metallo", vetro: "Vetro", tessuto: "Tessuto", pelle: "Pelle" },
  ceiling_type: { piano: "Piano liscio", controsoffitto_cartongesso: "Controsoffitto cartongesso", travi_legno: "Travi in legno", boiserie_soffitto: "Boiserie soffitto" },
  lighting_type: { faretti_incassati: "Faretti incassati", binario: "Binario con faretti orientabili", lampadario_centrale: "Lampadario centrale", led_strip_perimetrale: "LED strip perimetrale", lampade_sospensione: "Lampade a sospensione", applique_parete: "Applique a parete", misto: "Misto" },
  wallpaper_pattern: { geometrico: "Geometrico", floreale: "Floreale", tropicale: "Tropicale", astratto: "Astratto", righe: "Righe", damasco: "Damasco", toile_de_jouy: "Toile de Jouy", botanico: "Botanico", minimal: "Minimal" },
  cladding_type: { boiserie_legno: "Boiserie legno", mattone_vista: "Mattone a vista", pietra_naturale: "Pietra naturale", pannelli_3d: "Pannelli 3D", intonaco_spatolato: "Intonaco spatolato", stucco_veneziano: "Stucco veneziano" },
  curtain_type: { tende_a_pannello: "Pannello", tende_classiche: "Classiche", veneziane: "Veneziane", rullo: "A rullo", tende_lino: "Lino", tende_velluto: "Velluto", nessuna: "Nessuna tenda" },
  kitchen_front: { laccato: "Laccato", legno: "Legno", effetto_legno: "Effetto legno", vetro: "Vetro", metallo: "Metallo" },
  kitchen_worktop: { marmo: "Marmo", granito: "Granito", quarzo: "Quarzo", laminato: "Laminato", legno: "Legno" },
  kitchen_handle: { senza_maniglia: "Senza maniglia (push)", metallo_nero: "Metallo nero", metallo_oro: "Metallo oro", legno: "Legno", cromato: "Cromato" },
};

const record = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
const table = (id: string): PhotoTable => ROOM_VISUAL_PHOTOS[id] ?? {};

export function roomVisualChoices(group: RoomVisualGroup, config?: unknown): RoomVisualChoice[] {
  const cfg = record(config), rawFloor = record(cfg.pavimento);
  const floor = normalizeRoomFloorConfig(rawFloor);
  const surface = floorSurfacePhoto(floor)?.entry;
  const pattern: PhotoTable = {
    dritto: FLOOR_LAYOUT_PHOTOS.rettilineo_dritto, diagonale: FLOOR_LAYOUT_PHOTOS.diagonale_45,
    spina_pesce: FLOOR_LAYOUT_PHOTOS.spina_di_pesce, spina_ungherese: FLOOR_LAYOUT_PHOTOS.spina_ungherese,
    opus_romano: FLOOR_LAYOUT_PHOTOS.opus_romanum, sfalsato_33: FLOOR_LAYOUT_PHOTOS.sfalsato_33, modulare: FLOOR_LAYOUT_PHOTOS.modulare,
    ...table("floor-layout"),
  };
  const photos: Partial<Record<RoomVisualGroup, PhotoTable>> = {
    style: table("style"), paint_finish: { ...table("paint"), lavabile: table("paint").opaco },
    floor_effect: FLOOR_EFFECT_PHOTOS, floor_essence: FLOOR_ESSENCE_PHOTOS, floor_pattern: pattern,
    floor_finish: { ...FLOOR_FINISH_PHOTOS, strutturato: FLOOR_FINISH_PHOTOS.boccardato, naturale: surface ?? FLOOR_FINISH_PHOTOS.opaco },
    floor_skirting: { ...FLOOR_SKIRTING_PHOTOS, coordinato_pavimento: surface ?? FLOOR_SKIRTING_PHOTOS.bianco },
    furniture_material: table("furniture"), ceiling_type: table("ceiling"), lighting_type: { ...ROOM_LIGHTING_PHOTOS, ...table("lighting") },
    wallpaper_pattern: table("wallpaper"), cladding_type: { ...ROOM_CLADDING_PHOTOS, ...table("cladding") },
    curtain_type: table("curtains"), kitchen_front: table("kitchen-front"),
    kitchen_worktop: { marmo: FLOOR_EFFECT_PHOTOS.marmo, ...table("worktop") },
    kitchen_handle: { senza_maniglia: table("kitchen-front").laccato, ...table("kitchen-handle") },
  };
  return Object.entries(ROOM_VISUAL_LABELS[group]).map(([value, label]) => ({
    value, label,
    photo: group === "floor_type" ? (value === "mosaico" ? TILE_EFFECT_PHOTOS.mosaico_esagoni : floorSurfacePhoto(normalizeRoomFloorConfig({ ...rawFloor, tipo: value }))?.entry) : photos[group]?.[value],
    ...(group === "curtain_type" && value === "nessuna" ? { removal: true } : {}),
  }));
}

/** Tutte le scelte visive ATTIVE, senza il limite delle tre vecchie reference. */
export function selectedRoomVisuals(config: unknown): RoomVisualSelection[] {
  const cfg = record(config), out: RoomVisualSelection[] = [];
  const section = (k: string) => record(cfg[k]);
  const add = (group: RoomVisualGroup, key: unknown, target: string, details: Record<string, unknown>, instruction: string) => {
    const scelta = roomVisualChoices(group, cfg).find((c) => c.value === key);
    if (!scelta?.photo || scelta.removal) return;
    const text = Object.entries(details).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => `${k}: ${String(v).replace(/[\r\n]/g, " ").slice(0, 180)}`).join("; ");
    out.push({ ...scelta, id: `${group}:${scelta.value}`, group, target, instruction: `${instruction}${text ? ` Selected specification: ${text}.` : ""}` });
  };
  const arredo = section("arredo");
  add("style", cfg.stile_target ?? "moderno", "INTERIOR STYLE ONLY", {}, "Use the design language and palette only; NEVER copy the sample room architecture, camera, openings or furniture placement. Only change items enabled in the request.");
  const pav = section("pavimento");
  if (pav.attivo === true) {
    add("floor_type", pav.tipo ?? "gres_porcellanato", "FLOOR SURFACE", pav, pav.tipo === "mosaico" ? "Copy the small hexagonal mosaic tesserae and grout grid shown in this sample, with the specified colour/finish. Format dimensions describe the carrier sheet, NEVER one tessera: do not turn this mosaic into large-format tiles." : "Copy the selected floor surface identity, grain/veining, texture and material; honour its written type, colour, format and laying pattern, not the sample room or furniture.");
    const continuo = pav.tipo === "mosaico" || ["resina_continua", "microcemento", "cemento_resina", "moquette"].includes(normalizeRoomFloorConfig(pav).tipo);
    if (!continuo) add("floor_pattern", pav.pattern ?? "dritto", "FLOOR LAYING PATTERN ONLY", { format: pav.formato_piastrella }, "Copy ONLY the joint geometry and laying pattern; material, colour and module dimensions come from FLOOR SURFACE and the written specification.");
    // La finitura è una proprietà di riflessione, non un secondo materiale da sovrapporre.
    add("floor_finish", pav.finitura ?? "opaco", "FLOOR FINISH ONLY", {}, "Copy ONLY the degree of sheen/roughness. Never substitute this detail sample's material or colour for the chosen floor surface.");
    if (pav.battiscopa_azione === "sostituisci") add("floor_skirting", pav.battiscopa_tipo ?? "coordinato_pavimento", "SKIRTING ONLY", { height_cm: pav.battiscopa_altezza_cm }, "Copy ONLY the skirting profile/material. Coordinated skirting uses the selected floor's material, never its tile layout.");
  }
  const specs: Array<[string, RoomVisualGroup, string, string, string]> = [
    ["verniciatura", "paint_finish", "finitura", "PAINTED WALL FINISH", "Copy the paint finish only. The exact paint colour and target wall(s) are in the specification."],
    ["rivestimento_pareti", "cladding_type", "tipo", "WALL CLADDING", "Copy this wall cladding's surface, relief, panel/joint pattern and scale only on the selected walls."],
    ["carta_da_parati", "wallpaper_pattern", "stile_pattern", "WALLPAPER", "Reproduce this exact wallpaper motif, repeat, detail and palette on the selected walls; recolour only if a base colour is explicitly specified. Do not replace it with a merely similar pattern."],
    ["soffitto", "ceiling_type", "tipo", "CEILING", "Copy the chosen ceiling construction and panel/beam details, adapted to the actual room dimensions; preserve the real ceiling height and openings."],
    ["illuminazione", "lighting_type", "tipo", "LIGHT FITTINGS", "Copy these light fitting types and mounting details. Their colour temperature, brightness and placement follow the written specification."],
    ["tende", "curtain_type", "tipo", "WINDOW TREATMENT", "Copy this curtain/blind construction, fabric type and folds on the real existing window, with the selected colour. Do not copy the sample window itself."],
  ];
  const predefiniti: Record<string, string> = { verniciatura: "satinato", rivestimento_pareti: "boiserie_legno", carta_da_parati: "geometrico", soffitto: "piano", illuminazione: "misto", tende: "tende_classiche" };
  for (const [name, group, field, target, copy] of specs) { const s = section(name); if (s.attivo === true) add(group, s[field] ?? predefiniti[name], target, s, copy); }
  if (arredo.attivo === true && arredo.intensita_cambio !== "colore_sola") add("furniture_material", arredo.materiale ?? "legno_chiaro", "FURNITURE MATERIAL", arredo, "Copy the selected furniture material, construction language, texture and upholstery. Keep the existing furniture footprints/layout unless full replacement is enabled; never duplicate items or copy sample room architecture.");
  const cucina = section("restyling_cucina");
  if (cfg.tipo_stanza === "cucina" && cucina.attivo === true) {
    add("kitchen_front", cucina.materiale_frontali ?? "laccato", "KITCHEN CABINET FRONTS", { colour: cucina.colore_frontali_hex }, "Copy the cabinet front material/finish only, keeping the real kitchen modules, appliances and layout.");
    add("kitchen_worktop", cucina.piano_lavoro_materiale ?? "quarzo", "KITCHEN WORKTOP", { colour: cucina.colore_piano_lavoro_hex }, "Copy the selected slab material, grain/mineral pattern and edge finish only, at realistic worktop scale.");
    add("kitchen_handle", cucina.maniglie ?? "senza_maniglia", "KITCHEN HANDLES", {}, "Copy this kitchen handle model and finish only. For handle-free fronts remove old handles and do not add any.");
  }
  return out;
}

export function roomVisualSignature(config: unknown): string {
  const text = JSON.stringify(selectedRoomVisuals(config));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
