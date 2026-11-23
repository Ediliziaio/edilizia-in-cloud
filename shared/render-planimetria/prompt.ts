/**
 * Render AI dalla pianta: i pezzi di prompt che `generate-room-render` aggiunge quando
 * la sessione viene da una stanza della pianta (fase 5b).
 *
 * - `bloccoPartenza3D`: l'immagine di partenza è una vista del 3D (con eventuali
 *   finiture scelte) e non una foto: va trasformata in una foto della stessa stanza.
 * - `bloccoPianta`: misure vere e porte/finestre, con la pianta della stanza allegata.
 * - `righeQaPianta`: cosa il controllo visivo deve verificare su porte e finestre.
 *
 * In inglese: è il testo per i modelli, non per l'utente. Le misure stimate sono dette
 * «approximately»: non si presentano come vere misure che nessuno ha preso.
 */
import { campioneFinitura, type SuperficieFinitura } from "../planimetrie/finiture.ts";
import { altezzaPensiliCucina, altezzaTestieraLetto, disposizioneIsola, modelloArredo } from "../planimetrie/modelliArredo.ts";
import type { Elemento } from "../planimetrie/modello.ts";
import type { AperturaStanza, VincoliStanza } from "./vincoli.ts";

export type PartenzaRender = "foto" | "vista_3d";

/** Un'apertura inquadrata dalla vista del 3D (dai metadati del fotogramma, fase 5a). */
export interface AperturaInquadrata {
  id: string;
  posizione: "sinistra" | "centro" | "destra";
  /** Frazioni 0–1, origine in alto a sinistra. */
  riquadro: { x0: number; y0: number; x1: number; y1: number };
  ritagliata?: boolean;
}

/** Centro approssimativo della parte visibile dell'oggetto nella sola immagine sorgente. */
export interface ArredoNelFotogramma { id: string; x: number; y: number; ritagliato?: boolean }

const cm = (n: number) => `${Math.round(n)} cm`;
const m = (n: number) => `${(n / 100).toFixed(2)} m`;
const pct = (f: number) => `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
const LATO: Record<AperturaInquadrata["posizione"], string> = { sinistra: "left", centro: "centre", destra: "right" };
const fra01 = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;

/** Solo le aperture che appartengono davvero alla stanza (il browser può mandare di tutto). */
export function inquadrateValide(v: VincoliStanza, inquadrate: unknown): AperturaInquadrata[] {
  if (!Array.isArray(inquadrate)) return [];
  const ids = new Set(v.aperture.map((a) => a.id));
  const out: AperturaInquadrata[] = [];
  for (const raw of inquadrate) {
    const r = raw as Partial<AperturaInquadrata> | null;
    if (!r || typeof r.id !== "string" || !ids.has(r.id) || out.some((o) => o.id === r.id)) continue;
    if (r.posizione !== "sinistra" && r.posizione !== "centro" && r.posizione !== "destra") continue;
    const q = r.riquadro;
    if (!q || ![q.x0, q.y0, q.x1, q.y1].every(fra01) || q.x1 <= q.x0 || q.y1 <= q.y0) continue;
    out.push({ id: r.id, posizione: r.posizione, riquadro: { x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1 },
      ...(r.ritagliata === true ? { ritagliata: true } : {}) });
  }
  return out;
}

function descriviApertura(a: AperturaStanza, circa: boolean): string {
  const ca = circa || a.stimata ? "approximately " : "";
  const quota = a.davanzale_cm > 0 ? `, sill at ${ca}${cm(a.davanzale_cm)} from the floor` : "";
  return `${a.label}: ${ca}${cm(a.larghezza_cm)} wide × ${cm(a.altezza_cm)} high${quota}, on wall ${a.parete}, ${ca}${cm(a.da_inizio_parete_cm)} from the start of that wall`;
}

/** Testa del prompt quando si parte da una vista del 3D invece che da una foto. */
export function bloccoPartenza3D(): string {
  return [
    "SOURCE IMAGE — Image 1 is the customer's 3D room from the chosen camera, NOT a photograph. Use it as the visual blueprint for an interior photograph. Preserve camera position, lens, crop, wall geometry, ceiling height, and the position, size and frame configuration of every visible opening.",
    "Keep the installed furniture and sanitary fixtures at the same footprint, position and orientation. Preserve their silhouette and mounting height. Keep the colour, direction and coverage of the customer-selected material textures on floors, walls and ceilings. Apply local overrides only where the customer selected a change for this render.",
    "FURNITURE INVENTORY LOCK: show only items visible in Image 1. Preserve partial crops. Do not add a coffee table, side table, rug, chair, ottoman or extra cabinet unless the written customer brief explicitly requests that addition or complete furniture replacement. Never copy extra furnishings or rugs from style and material samples. Leave the chosen floor visible.",
    "Do not add walls, columns, niches, doors or windows that Image 1 does not show. Add decorative ceiling beams or panels ONLY when the selected ceiling intervention explicitly requests them, preserving the real ceiling height.",
    "Photograph the same modeled scene: use credible bounce light from existing openings, soft contact shadows under furniture, finely scaled material grain and subtle highlights on edges, glass and metal. Retain detail in light and dark areas. Keep verticals and vanishing lines from the source camera. Avoid flat CAD shading, artificial gloss, strong vignette and depth-of-field blur. Output only the photograph without labels or graphics.",
  ].join("\n");
}

const ARREDI_DIMENSIONATI: Readonly<Record<string, string>> = {
  cucina: "straight kitchen cabinet run", cucina_angolare: "L-shaped kitchen cabinet run",
  isola_cucina: "kitchen island and its in-frame stools", letto: "bed",
  letto_matrimoniale: "double bed", letto_singolo: "single bed",
  armadio: "wardrobe", divano: "sofa", divano_angolare: "corner sofa", tavolo: "table",
  wc: "toilet", bidet: "bidet", lavabo: "washbasin", doccia: "one shower enclosure with its existing tray, drain and glass panels. If a mixer and shower column are visible, preserve the wall rosettes and the continuous rigid connection to the same solid wall", vasca: "bathtub",
  lavatrice: "washing machine", frigorifero: "refrigerator", lavastoviglie: "dishwasher", scrivania: "desk", libreria: "bookcase", sedia: "chair", comodino: "bedside table",
  poltrona: "armchair", tavolino: "coffee table", mobile_tv: "low media cabinet and its TV screen", tavolo_rotondo: "round table", lampada_piantana: "floor lamp",
};
const cmArredo = (n: number) => `${n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 2 })} cm`;

/** The browser supplies visible IDs. Model choices and sizes always come from the saved room. */
export function modelliInquadratiPerRender(elementi: readonly Elemento[], inquadrati: unknown, posizioni: unknown = []): string[] {
  const ids = new Set(Array.isArray(inquadrati) ? inquadrati.slice(0, 64) : []);
  const ancore = new Map<string, ArredoNelFotogramma>();
  if (Array.isArray(posizioni)) for (const raw of posizioni.slice(0, 64)) {
    const p = raw as Partial<ArredoNelFotogramma> | null;
    if (!p || typeof p.id !== "string" || !ids.has(p.id) || ancore.has(p.id) || !fra01(p.x) || !fra01(p.y)) continue;
    ancore.set(p.id, { id: p.id, x: p.x, y: p.y, ritagliato: p.ritagliato === true });
  }
  return elementi.flatMap(e => {
    if (!ids.has(e.id) || e.stato === "da_demolire") return [];
    const modello = modelloArredo(e.tipo, e.modello)?.render ?? (Object.hasOwn(ARREDI_DIMENSIONATI, e.tipo) ? ARREDI_DIMENSIONATI[e.tipo] : undefined);
    if (!modello) return [];
    const { larghezza, profondita, altezza } = e;
    const dimensionato = [larghezza, profondita].every(n => Number.isFinite(n) && n > 0);
    const ingombro = !dimensionato ? "" : e.tipo === "cucina_angolare"
      ? `, approximately ${cmArredo(larghezza)} on the long side × ${cmArredo(profondita)} on the return, including the corner`
      : `, footprint approximately ${cmArredo(larghezza)} × ${cmArredo(profondita)}`;
    let quota = "";
    if (altezza !== undefined && Number.isFinite(altezza) && altezza > 0) {
      if (e.tipo === "cucina_angolare") quota = `, worktop height ${cmArredo(altezza)}, wall cabinets reach ${cmArredo(altezzaPensiliCucina(altezza) + 70)}`;
      else if (e.tipo === "cucina" || e.tipo === "isola_cucina") quota = `, worktop height ${cmArredo(altezza)}`;
      else if (e.tipo === "letto" || e.tipo === "letto_singolo" || e.tipo === "letto_matrimoniale") {
        quota = `, mattress top at ${cmArredo(altezza)} above the floor, headboard ${cmArredo(altezzaTestieraLetto(altezza))} high`;
      } else if (Object.hasOwn(ARREDI_DIMENSIONATI, e.tipo)) quota = `, approximately ${cmArredo(altezza)} high`;
    }
    if (dimensionato && e.tipo === "isola_cucina") {
      quota += `, combined footprint includes stools, island worktop depth approximately ${cmArredo(disposizioneIsola(larghezza, profondita).banco)}`;
    }
    const colore = e.colore && /^#[0-9a-f]{6}$/i.test(e.colore) ? `, main surface colour ${e.colore}` : "";
    const ancora = ancore.get(e.id);
    const punto = ancora ? `, visible centre around ${pct(ancora.x)} across and ${pct(ancora.y)} down from the upper-left${ancora.ritagliato ? ", cropped at the image boundary" : ""}` : "";
    return [modello + ingombro + quota + colore + punto];
  });
}

export function bloccoModelliInquadrati(modelli: readonly string[]): string {
  if (!modelli.length) return "";
  return [
    "MODELS ALREADY INSTALLED IN THE SOURCE — retain these choices and their positions, including mounting details and shape. Coordinates locate the visible parts. Use the source image to match the silhouette and crop. Change a model only when the brief explicitly replaces that item. Do not create a second item to show a listed detail.",
    ...modelli.map(m => `- ${m}`),
  ].join("\n");
}

/** Testo libero dell'utente nel prompt: una riga, corto, senza virgolette che rompano la frase. */
const pulisci = (s: string | undefined) => (s ?? "").replace(/[\r\n"`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);

/**
 * Le finiture scelte nella pianta: sono del cliente, quindi valgono più dello stile generico.
 * Una riga sola, o stringa vuota se la stanza non ne ha.
 */
export function righeFiniture(finiture: VincoliStanza["locale"]["finiture"], interventi?: unknown): string {
  if (!finiture) return "";
  const f = { ...finiture };
  const cfg = interventi && typeof interventi === "object" ? interventi as Record<string, unknown> : {};
  const opzione = (k: string) => cfg[k] && typeof cfg[k] === "object" ? cfg[k] as Record<string, unknown> : {};
  if (opzione("pavimento").attivo === true) delete f.pavimento;
  if (opzione("soffitto").attivo === true) delete f.soffitto;
  const vernice = opzione("verniciatura"), rivestimento = opzione("rivestimento_pareti");
  if ((vernice.attivo === true && (vernice.applica_a ?? "tutte") === "tutte") || (rivestimento.attivo === true && rivestimento.applica_a === "tutte")) delete f.pareti;
  if (rivestimento.attivo === true && rivestimento.applica_a === "tutte") delete f.rivestimento;
  const parti: string[] = [];
  const pav = pulisci(f.pavimento), par = pulisci(f.pareti), sof = pulisci(f.soffitto);
  if (pav) parti.push(`floor: "${pav}"`);
  if (par) parti.push(`walls: "${par}"`);
  if (sof) parti.push(`ceiling: "${sof}"`);
  if (f.rivestimento && f.rivestimento.altezza > 0) {
    const mat = pulisci(f.rivestimento.materiale);
    parti.push(`wall tiles${mat ? ` "${mat}"` : ""} up to ${m(f.rivestimento.altezza)} from the floor`);
  }
  if (!parti.length) return "";
  const dettagli = (["pavimento", "pareti", "soffitto"] as SuperficieFinitura[]).flatMap((s) => {
    const c = campioneFinitura(f[s], s);
    if (!c) return [];
    const superficie = s === "pavimento" ? "floor" : s === "pareti" ? "walls" : "ceiling";
    const materiale = c.trama.startsWith("rovere")
      ? "recognisable natural wood grain, fine longitudinal fibres, subtle knots and individual board joints" + (c.trama === "rovere_spina" ? ", in the specified herringbone pattern" : "")
      : c.trama.startsWith("marmo")
        ? "natural marble mineral veining at slab scale; never a blank white surface or a printed repetitive pattern"
        : c.trama === "pietra"
          ? "natural stone mineral pores, quiet tonal variation and fine joints"
          : "the specified finish texture, colour and physically plausible surface roughness";
    return [`${superficie}: ${materiale}${c.id === "gres_legno" ? "; this is wood-look porcelain with fine grout lines, not solid wood" : ""}`];
  });
  return `Finishes chosen on the plan by the client (Italian descriptions; preserve these outside the areas explicitly changed by the selected render interventions; they take priority over the generic style): ${parti.join("; ")}. Render these as real physical materials, at realistic scale, with texture and appropriate reflections, not uniform colour fills. ${dettagli.join(". ")}${dettagli.length ? "." : ""}`;
}

/**
 * Misure e aperture della stanza, con la pianta allegata come immagine `immaginePianta`
 * (null se non c'è spazio per allegarla: restano le parole).
 */
export function bloccoPianta(
  v: VincoliStanza,
  opz: { partenza: PartenzaRender; inquadrate?: AperturaInquadrata[]; immaginePianta?: number | null; interventi?: unknown },
): string {
  const l = v.locale;
  const circa = l.stimata;
  const ca = circa ? "approximately " : "";
  const righe: string[] = [
    "FLOOR PLAN CONSTRAINTS — this room exists on a real floor plan; the render must respect it.",
    `Room: ${l.destinazione}. Internal size ${ca}${m(l.larghezza_cm)} × ${m(l.profondita_cm)}${l.rettangolare ? "" : " (overall footprint; the room is not a plain rectangle)"}, floor area ${ca}${l.superficie_mq.toFixed(1)} m², ceiling height ${ca}${m(l.altezza_cm)}. Furniture and fixtures must be at a realistic scale for these measurements.`,
  ];
  const fin = righeFiniture(l.finiture, opz.interventi);
  if (fin) righe.push(fin);
  if (opz.immaginePianta) {
    righe.push(`Image ${opz.immaginePianta} is the floor plan of THIS room seen from above (invisible input, never show it in the result): walls are numbered 1–${v.pareti.length} going counter-clockwise; doors are drawn in blue, windows in orange, each with its name. Use it only to know where every opening is.`);
  }
  if (v.aperture.length === 0) {
    righe.push("The room has NO doors or windows on its walls: do not invent any.");
  } else {
    righe.push(`The room has exactly ${v.aperture.length} opening${v.aperture.length === 1 ? "" : "s"} — no more, no fewer:`);
    for (const a of v.aperture) righe.push(`- ${descriviApertura(a, circa)}`);
  }
  const inquadrate = opz.inquadrate ?? [];
  if (opz.partenza === "vista_3d") {
    const perId = new Map(v.aperture.map((a) => [a.id, a]));
    if (inquadrate.length === 0) {
      righe.push("None of these openings is in view from this camera: the walls in the image must stay solid, with no door or window.");
    } else {
      righe.push("Openings visible in Image 1 (horizontal and vertical extent as a fraction of the image, from the top-left corner):");
      for (const q of inquadrate) {
        const a = perId.get(q.id);
        if (!a) continue;
        righe.push(`- ${a.label}, ${LATO[q.posizione]}: from ${pct(q.riquadro.x0)} to ${pct(q.riquadro.x1)} across, from ${pct(q.riquadro.y0)} to ${pct(q.riquadro.y1)} down. Keep it exactly there and of that size.${q.ritagliata ? " The image clips this opening; keep the same partial crop." : ""}`);
      }
      righe.push("Every other opening of the list is behind the camera or out of frame: do not show it, and do not add any other door or window.");
    }
  } else {
    righe.push("Keep every door and window that the source photo shows exactly where it is. Never add a door or window that the photo does not show; the plan above tells how many the room really has.");
  }
  return righe.join("\n");
}

/** Righe in più per il controllo visivo (QA) del render. */
export function righeQaPianta(v: VincoliStanza, opz: { partenza: PartenzaRender; inquadrate?: AperturaInquadrata[] }): string[] {
  const perId = new Map(v.aperture.map((a) => [a.id, a]));
  const inquadrate = (opz.inquadrate ?? []).filter((q) => perId.has(q.id));
  const righe = [
    `- plan_openings_mismatch: according to the floor plan the room has ${v.aperture.length} opening${v.aperture.length === 1 ? "" : "s"} in total (${v.aperture.map((a) => a.label).join(", ") || "none"}). Fail if the candidate shows a door or window that the source image does not show, or if a door or window of the source image is missing, walled up, moved to another wall or clearly resized.`,
  ];
  if (opz.partenza === "vista_3d") {
    righe.push(
      "- The source (Image 1) is a 3D model, not a photo: photorealistic materials, light and furniture are expected; selected render interventions may replace the source finishes. That is expected and is NOT a geometry change. Judge walls, ceiling, camera, openings and preservation of the visible furniture inventory/footprints, unless the customer explicitly requests additions or full furniture replacement.",
      "- unrequested_furniture: fail if the candidate introduces a coffee table, side table, rug, chair, ottoman or cabinet that has no corresponding block in the source, unless the written customer request explicitly asks for it or for full furniture replacement. Small decorative objects on existing furniture are allowed. Never treat furniture in the sample boards as permission to add it to the real room.",
      "- geometry_change: compare EACH visible furniture item and sanitary fixture with its own source footprint and position. Fail if a bed, wardrobe, sofa, desk, kitchen unit, toilet, bidet, washbasin or washing machine is swapped, moved to another place, or replaced by a different object. A matching total item count is NOT enough. Styling does not authorize rearrangement.",
      "- geometry_change: where the source shows a visible connection from the shower mixer or column to a solid wall, fail if it floats, is disconnected or is attached to glass or a window instead. Judge connections actually visible in both views.",
      "- Do not infer a kitchen, bed, chair or any other furniture from the room name. Use the visible object positions and models when supplied. Keep items behind the camera out of frame. If the source contains labels, they must disappear in the final photograph.",
    );
    if (inquadrate.length > 0) {
      righe.push(
        `- Openings expected in the frame: ${inquadrate.map((q) => `${perId.get(q.id)!.label} (${LATO[q.posizione]}, ${pct(q.riquadro.x0)}–${pct(q.riquadro.x1)} across, ${pct(q.riquadro.y0)}–${pct(q.riquadro.y1)} down${q.ritagliata ? ", partially cropped" : ""})`).join("; ")}. Fail with plan_openings_mismatch if one of them is missing, clearly displaced, resized or uncropped.`,
      );
    } else {
      righe.push("- No opening is expected in the frame: fail with plan_openings_mismatch if the candidate shows any door or window.");
    }
  }
  return righe;
}

/** Da aggiungere alla correzione del secondo tentativo quando il QA boccia le aperture. */
export function correzionePianta(v: VincoliStanza): string {
  return `Doors and windows must match the floor plan exactly: ${v.aperture.length} in total (${v.aperture.map((a) => a.label).join(", ") || "none"}), each on its own wall, in its own place, with its own size.`;
}
