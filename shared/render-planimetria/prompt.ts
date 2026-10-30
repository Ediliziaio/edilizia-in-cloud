/**
 * Render AI dalla pianta: i pezzi di prompt che `generate-room-render` aggiunge quando
 * la sessione viene da una stanza della pianta (fase 5b).
 *
 * - `bloccoPartenza3D`: l'immagine di partenza è una vista del 3D (grigia, senza
 *   materiali) e non una foto: va trasformata in una foto della stessa stanza.
 * - `bloccoPianta`: misure vere e porte/finestre, con la pianta della stanza allegata.
 * - `righeQaPianta`: cosa il controllo visivo deve verificare su porte e finestre.
 *
 * In inglese: è il testo per i modelli, non per l'utente. Le misure stimate sono dette
 * «approximately»: non si presentano come vere misure che nessuno ha preso.
 */
import type { AperturaStanza, VincoliStanza } from "./vincoli.ts";

export type PartenzaRender = "foto" | "vista_3d";

/** Un'apertura inquadrata dalla vista del 3D (dai metadati del fotogramma, fase 5a). */
export interface AperturaInquadrata {
  id: string;
  posizione: "sinistra" | "centro" | "destra";
  /** Frazioni 0–1, origine in alto a sinistra. */
  riquadro: { x0: number; y0: number; x1: number; y1: number };
}

const cm = (n: number) => `${Math.round(n)} cm`;
const m = (n: number) => `${(n / 100).toFixed(2)} m`;
const pct = (f: number) => `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
const LATO: Record<AperturaInquadrata["posizione"], string> = { sinistra: "left", centro: "centre", destra: "right" };

/** Solo le aperture che appartengono davvero alla stanza (il browser può mandare di tutto). */
export function inquadrateValide(v: VincoliStanza, inquadrate: unknown): AperturaInquadrata[] {
  if (!Array.isArray(inquadrate)) return [];
  const ids = new Set(v.aperture.map((a) => a.id));
  const fra01 = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
  const out: AperturaInquadrata[] = [];
  for (const raw of inquadrate) {
    const r = raw as Partial<AperturaInquadrata> | null;
    if (!r || typeof r.id !== "string" || !ids.has(r.id) || out.some((o) => o.id === r.id)) continue;
    if (r.posizione !== "sinistra" && r.posizione !== "centro" && r.posizione !== "destra") continue;
    const q = r.riquadro;
    if (!q || ![q.x0, q.y0, q.x1, q.y1].every(fra01) || q.x1 <= q.x0 || q.y1 <= q.y0) continue;
    out.push({ id: r.id, posizione: r.posizione, riquadro: { x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1 } });
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
    "SOURCE IMAGE — IMPORTANT: Image 1 is NOT a photograph. It is a plain 3D model of the real room, seen from the exact viewpoint the customer chose: grey walls, white ceiling, simple flat floor, openings as empty holes or pale glass, furniture as plain blocks.",
    "Turn it into a photorealistic photograph of the SAME room: keep the exact camera position, lens and framing, the position and length of every wall, the ceiling height, and every door and window exactly where the holes are in Image 1. Plain blocks mark where fixtures and furniture stand: replace them with real furniture of the same footprint in the same place, styled as described below.",
    "Do not add walls, columns, beams, niches, doors or windows that Image 1 does not show. Add realistic daylight through the windows, realistic materials and soft shadows.",
  ].join("\n");
}

/**
 * Misure e aperture della stanza, con la pianta allegata come immagine `immaginePianta`
 * (null se non c'è spazio per allegarla: restano le parole).
 */
export function bloccoPianta(
  v: VincoliStanza,
  opz: { partenza: PartenzaRender; inquadrate?: AperturaInquadrata[]; immaginePianta?: number | null },
): string {
  const l = v.locale;
  const circa = l.stimata;
  const ca = circa ? "approximately " : "";
  const righe: string[] = [
    "FLOOR PLAN CONSTRAINTS — this room exists on a real floor plan; the render must respect it.",
    `Room: ${l.destinazione}. Internal size ${ca}${m(l.larghezza_cm)} × ${m(l.profondita_cm)}${l.rettangolare ? "" : " (overall footprint; the room is not a plain rectangle)"}, floor area ${ca}${l.superficie_mq.toFixed(1)} m², ceiling height ${ca}${m(l.altezza_cm)}. Furniture and fixtures must be at a realistic scale for these measurements.`,
  ];
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
        righe.push(`- ${a.label}, ${LATO[q.posizione]}: from ${pct(q.riquadro.x0)} to ${pct(q.riquadro.x1)} across, from ${pct(q.riquadro.y0)} to ${pct(q.riquadro.y1)} down. Keep it exactly there and of that size.`);
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
      "- The source (Image 1) is a plain grey 3D model, not a photo: the candidate SHOULD look completely different in materials, light and furniture style. That is expected and is NOT a geometry change. Judge only walls, ceiling, camera and openings.",
    );
    if (inquadrate.length > 0) {
      righe.push(
        `- Openings expected in the frame: ${inquadrate.map((q) => `${perId.get(q.id)!.label} (${LATO[q.posizione]}, ${pct(q.riquadro.x0)}–${pct(q.riquadro.x1)} across)`).join("; ")}. Fail with plan_openings_mismatch if one of them is missing or clearly displaced.`,
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
