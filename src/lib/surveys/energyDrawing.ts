import type { ElementTypeDefinition } from "@/types/surveys";
import { energyKind, type EnergyValues } from "./energySurvey";

export interface EnergyRect {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  kind: "module" | "obstacle" | "equipment";
}
export interface EnergyScene {
  width: number;
  height: number;
  label: string;
  unit: string;
  rects: EnergyRect[];
  checks: string[];
  caption: string;
}
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const pos = (v: unknown): v is number => finite(v) && v > 0;
const intersects = (a: EnergyRect, b: EnergyRect) =>
  a.x < b.x + b.w - 1e-7 &&
  a.x + a.w > b.x + 1e-7 &&
  a.y < b.y + b.h - 1e-7 &&
  a.y + a.h > b.y + 1e-7;
export function energyRects(
  v: EnergyValues,
  key: "en_layout" | "en_obstacles",
): EnergyRect[] {
  const raw = v[key];
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 200)
    throw new Error("Disposizione non valida: massimo 200 elementi.");
  return raw.map((r: unknown, i) => {
    if (!r || typeof r !== "object")
      throw new Error("Rettangolo di posa non valido.");
    const a = r as Record<string, unknown>;
    if (
      !finite(a.x) ||
      !finite(a.y) ||
      !pos(a.w) ||
      !pos(a.h) ||
      a.x < 0 ||
      a.y < 0 ||
      Math.max(a.x, a.y, a.w, a.h) > 100000
    )
      throw new Error(
        "Controlla posizione e dimensioni: servono misure finite e positive.",
      );
    return {
      x: a.x,
      y: a.y,
      w: a.w,
      h: a.h,
      label: String(a.label ?? i + 1).slice(0, 80),
      kind: key === "en_layout" ? "module" : "obstacle",
    };
  });
}
function moduleSize(v: EnergyValues) {
  if (!pos(v.en_module_width) || !pos(v.en_module_height))
    throw new Error("Inserisci le dimensioni effettive del modulo in mm.");
  const pair = [v.en_module_width / 1000, v.en_module_height / 1000];
  if (v.en_orientation === "orizzontale") pair.reverse();
  else if (v.en_orientation !== "verticale")
    throw new Error("Conferma l’orientamento dei moduli.");
  return pair;
}
export function proposeEnergyLayout(v: EnergyValues): EnergyRect[] {
  if (v.en_plane !== "falda")
    throw new Error(
      "Servono misure sul piano della falda, non la proiezione orizzontale.",
    );
  if (
    !pos(v.en_width) ||
    !pos(v.en_height) ||
    !Number.isInteger(v.en_count) ||
    !pos(v.en_count) ||
    v.en_count > 200
  )
    throw new Error(
      "Inserisci dimensioni falda e numero intero di moduli (1–200).",
    );
  if (
    !finite(v.en_margin) ||
    v.en_margin < 0 ||
    !finite(v.en_gap) ||
    v.en_gap < 0
  )
    throw new Error(
      "Conferma fascia di bordo e interspazio da progetto, anche se pari a zero.",
    );
  const [w, h] = moduleSize(v),
    margin = v.en_margin,
    gap = v.en_gap,
    obstacles = energyRects(v, "en_obstacles");
  const cols = Math.floor((v.en_width - 2 * margin + gap) / (w + gap)),
    rows = Math.floor((v.en_height - 2 * margin + gap) / (h + gap));
  if (cols < 1 || rows < 1 || cols * rows > 10000)
    throw new Error(
      "Dimensioni incompatibili o griglia eccessiva: verifica le misure.",
    );
  const result: EnergyRect[] = [];
  for (let row = 0; row < rows && result.length < v.en_count; row++)
    for (let col = 0; col < cols && result.length < v.en_count; col++) {
      const rect: EnergyRect = {
        x: margin + col * (w + gap),
        y: margin + row * (h + gap),
        w,
        h,
        label: String(result.length + 1),
        kind: "module",
      };
      if (!obstacles.some((o) => intersects(o, rect))) result.push(rect);
    }
  if (result.length !== v.en_count)
    throw new Error(
      `Spazio disponibile per ${result.length} moduli su ${v.en_count} richiesti. Nessuna quantità è stata cambiata.`,
    );
  return result;
}
export function energyGeometryIssues(
  type: ElementTypeDefinition,
  v: EnergyValues,
): string[] {
  if (energyKind(type) !== "roof") return [];
  try {
    const modules = energyRects(v, "en_layout"),
      obs = energyRects(v, "en_obstacles"),
      checks: string[] = [];
    if (!modules.length)
      return ["Disposizione moduli da preparare e verificare sul rilievo."];
    if (modules.length !== v.en_count)
      checks.push("Numero moduli del disegno diverso dalla quantità rilevata.");
    const [w, h] = moduleSize(v),
      margin = finite(v.en_margin) ? v.en_margin : 0,
      gap = finite(v.en_gap) ? v.en_gap : 0;
    if (!pos(v.en_width) || !pos(v.en_height))
      return ["Dimensioni falda mancanti."];
    const width = v.en_width,
      height = v.en_height;
    if (!finite(v.en_margin) || !finite(v.en_gap))
      checks.push("Fascia di bordo e interspazio da confermare.");
    for (const r of [...modules, ...obs])
      if (r.x + r.w > v.en_width + 1e-7 || r.y + r.h > v.en_height + 1e-7)
        checks.push(
          `${r.kind === "module" ? "Modulo" : "Ostacolo"} ${r.label} fuori dalla falda.`,
        );
    modules.forEach((r, i) => {
      if (Math.abs(r.w - w) > 1e-6 || Math.abs(r.h - h) > 1e-6)
        checks.push(
          "Dimensioni del disegno non aggiornate al modulo selezionato: rigenera la disposizione.",
        );
      if (
        r.x < margin - 1e-7 ||
        r.y < margin - 1e-7 ||
        r.x + r.w > width - margin + 1e-7 ||
        r.y + r.h > height - margin + 1e-7
      )
        checks.push(`Modulo ${r.label} nella fascia esclusa dal bordo.`);
      if (obs.some((o) => intersects(o, r)))
        checks.push(`Modulo ${r.label} sovrapposto a un ostacolo.`);
      const buffered = {
        ...r,
        x: r.x - gap / 2,
        y: r.y - gap / 2,
        w: r.w + gap,
        h: r.h + gap,
      };
      if (
        modules.slice(i + 1).some((other) =>
          intersects(buffered, {
            ...other,
            x: other.x - gap / 2,
            y: other.y - gap / 2,
            w: other.w + gap,
            h: other.h + gap,
          }),
        )
      )
        checks.push("Moduli sovrapposti o interspazio non rispettato.");
    });
    return [...new Set(checks)];
  } catch (error) {
    return [(error as Error).message];
  }
}
export function validateEnergyValues(
  type: ElementTypeDefinition,
  v: EnergyValues,
) {
  if (!energyKind(type)) return;
  energyRects(v, "en_layout");
  energyRects(v, "en_obstacles");
  if (
    v.en_count != null &&
    (!Number.isInteger(v.en_count) || !pos(v.en_count) || v.en_count > 200)
  )
    throw new Error("La quantità deve essere intera fra 1 e 200.");
}
/** One geometry source for the screen and the native vector PDF. No yield, load or regulatory sizing. */
export function energyScene(
  type: ElementTypeDefinition,
  v: EnergyValues,
): EnergyScene {
  const kind = energyKind(type),
    checks = energyGeometryIssues(type, v);
  if (kind === "roof") {
    let rects: EnergyRect[] = [];
    try {
      rects = [
        ...energyRects(v, "en_layout"),
        ...energyRects(v, "en_obstacles"),
      ];
    } catch {
      /* issue rendered separately */
    }
    return {
      width: pos(v.en_width) ? v.en_width : 10,
      height: pos(v.en_height) ? v.en_height : 6,
      label: "Disposizione sul piano della falda",
      unit: "m",
      rects,
      checks,
      caption:
        "Quote sul piano di posa. Ostacoli come ingombri rilevati, non come ombre calcolate. Schema preliminare, non progetto esecutivo.",
    };
  }
  if (kind === "route")
    return {
      width: 10,
      height: 3,
      label: `${String(v.en_from || "Partenza")} → ${String(v.en_to || "Arrivo")}`,
      unit: "m",
      rects: [
        { x: 0.3, y: 0.6, w: 2, h: 1.4, label: "Da", kind: "equipment" },
        { x: 7.7, y: 0.6, w: 2, h: 1.4, label: "A", kind: "equipment" },
      ],
      checks: [],
      caption: `Schema funzionale, non in scala. Tratto ${v.en_length ?? "?"} m · dislivello ${v.en_rise ?? "?"} m. Sezioni, diametri e collegamenti da progetto.`,
    };
  const w = pos(v.en_width_mm) ? v.en_width_mm : 0,
    d = pos(v.en_depth_mm) ? v.en_depth_mm : 0;
  const left = pos(v.en_free_left) ? v.en_free_left : 0,
    right = pos(v.en_free_right) ? v.en_free_right : 0,
    front = pos(v.en_free_front) ? v.en_free_front : 0,
    back = pos(v.en_free_back) ? v.en_free_back : 0;
  return {
    width: Math.max(w + left + right, 100),
    height: Math.max(d + front + back, 100),
    label: w && d ? "Pianta e spazi liberi rilevati" : "Ingombri da rilevare",
    unit: "mm",
    rects:
      w && d
        ? [{ x: left, y: back, w, h: d, label: type.label, kind: "equipment" }]
        : [],
    checks: [],
    caption: `Vista in pianta: apparecchio ${w || "?"} × ${d || "?"} mm. Spazi liberi frontale ${finite(v.en_free_front) ? v.en_free_front : "non rilevato"}, posteriore ${finite(v.en_free_back) ? v.en_free_back : "non rilevato"}, sinistro ${finite(v.en_free_left) ? v.en_free_left : "non rilevato"}, destro ${finite(v.en_free_right) ? v.en_free_right : "non rilevato"} mm. Le quote complessive sommano soltanto gli spazi registrati. Nessuna distanza normativa impostata automaticamente.`,
  };
}
