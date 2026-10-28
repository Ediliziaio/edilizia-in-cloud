/** Original diagrams: movement conventions, never a manufacturer's executable profile.
 * L/R are seen from side A. In these plans A is at the bottom, B at the top. */
import type {
  Forma,
  ScenaSerramento,
} from "@/lib/serramenti/disegnoSerramento";
import type { FieldDefinition, FieldSection } from "@/types/surveys";
type Values = Record<string, unknown>;
export const SLIDING_DOORS = ["scorrevole_esterno", "scorrevole_scomparsa"];
export const FOLDING_DOORS = ["a_libro", "a_soffietto"];
export const MOVING_DOORS = [...SLIDING_DOORS, ...FOLDING_DOORS];
const num = (key: string, label: string): FieldDefinition => ({
  key,
  label,
  type: "dimension",
  unit: "mm",
  min: 0.1,
  max: 100000,
  width: 6,
});
const select = (
  key: string,
  label: string,
  pairs: string[][],
): FieldDefinition => ({
  key,
  label,
  type: "select",
  width: 6,
  options: pairs.map(([value, label]) => ({ value, label })),
});
export function doorMovementSection(): FieldSection {
  return {
    key: "rv_door_movement",
    label: "Scorrevole / libro · movimento e ingombri",
    show_if: { field: "tipologia", operator: "in", value: MOVING_DOORS },
    fields: [
      {
        ...select(
          "rv_door_slide_face",
          "Esterno muro · il pannello scorre sul",
          [
            ["a", "Lato A"],
            ["b", "Lato B"],
          ],
        ),
        show_if: {
          field: "tipologia",
          operator: "eq",
          value: "scorrevole_esterno",
        },
        help: "Esterno muro non significa esterno dell’edificio: identifica la faccia della parete.",
      },
      {
        ...select("rv_door_fold_layout", "Pannelli della porta a libro", [
          ["simmetrica", "Due pannelli simmetrici"],
          ["asimmetrica", "Due pannelli asimmetrici"],
        ]),
        width: 12,
        show_if: { field: "tipologia", operator: "eq", value: "a_libro" },
      },
      {
        ...num(
          "rv_door_fold_split_mm",
          "Divisorio dal bordo di raccolta · modulo porta",
        ),
        show_if: [
          { field: "tipologia", operator: "eq", value: "a_libro" },
          {
            field: "rv_door_fold_layout",
            operator: "eq",
            value: "asimmetrica",
          },
        ],
        help: "Dal bordo di raccolta del solo modulo porta, esclusi i fiancoluce. Non si presume una divisione 1/3-2/3 o una luce netta.",
      },
      {
        ...select("rv_door_fold_toward", "Il pacchetto si ripiega verso", [
          ["a", "Lato A"],
          ["b", "Lato B"],
        ]),
        show_if: { field: "tipologia", operator: "in", value: FOLDING_DOORS },
      },
      {
        key: "rv_door_fold_panels",
        label: "Soffietto · numero di pannelli rilevato",
        type: "number",
        min: 2,
        max: 20,
        step: 1,
        width: 6,
        show_if: { field: "tipologia", operator: "eq", value: "a_soffietto" },
      },
      {
        ...num(
          "rv_door_free_left",
          "Parete / vano di raccolta libero a sinistra · lato A",
        ),
        show_if: { field: "tipologia", operator: "in", value: SLIDING_DOORS },
      },
      {
        ...num(
          "rv_door_free_right",
          "Parete / vano di raccolta libero a destra · lato A",
        ),
        show_if: { field: "tipologia", operator: "in", value: SLIDING_DOORS },
      },
      {
        ...num("rv_door_track_length", "Lunghezza binario rilevata"),
        show_if: { field: "tipologia", operator: "in", value: SLIDING_DOORS },
      },
      num("rv_door_clear_width", "Luce netta di passaggio rilevata"),
      {
        key: "rv_door_movement_notes",
        label:
          "Ostacoli, interruttori, battiscopa, maniglie e guida a pavimento",
        type: "textarea",
        width: 12,
        help: "Ingombri del pacchetto, corsa, spessori e compatibilità vanno verificati sul modello del produttore.",
      },
    ],
  };
}
const positive = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100000
    ? v
    : null;
export function foldingDivisions(width: number, v: Values): number[] | null {
  if (!Number.isFinite(width) || width <= 0 || width > 100000) return null;
  if (v.tipologia === "a_libro") {
    if (v.rv_door_fold_layout === "simmetrica") return [0.5];
    const split = positive(v.rv_door_fold_split_mm);
    if (
      v.rv_door_fold_layout === "asimmetrica" &&
      split &&
      split < width &&
      ["sx", "dx"].includes(String(v.rv_door_slide_side))
    )
      return [
        v.rv_door_slide_side === "sx" ? split / width : 1 - split / width,
      ];
  }
  if (
    v.tipologia === "a_soffietto" &&
    Number.isInteger(v.rv_door_fold_panels) &&
    Number(v.rv_door_fold_panels) >= 2 &&
    Number(v.rv_door_fold_panels) <= 20
  )
    return Array.from(
      { length: Number(v.rv_door_fold_panels) - 1 },
      (_, i) => (i + 1) / Number(v.rv_door_fold_panels),
    );
  return null;
}
const rect = (
  ruolo: Extract<Forma, { kind: "rect" }>["ruolo"],
  x: number,
  y: number,
  w: number,
  h: number,
): Forma => ({ kind: "rect", ruolo, x, y, w, h });
const line = (
  punti: Array<[number, number]>,
  symbol = false,
  dashed = false,
): Forma => ({
  kind: "poly",
  ruolo: symbol ? "simbolo" : "pannelloLinea",
  punti,
  tratteggio: dashed,
});
export function doorMovementPlan(
  width: number,
  v: Values,
  split: number | null = null,
) {
  const type = String(v.tipologia),
    sliding = SLIDING_DOORS.includes(type),
    folding = FOLDING_DOORS.includes(type);
  const warnings: string[] = [],
    side = String(v.rv_door_slide_side),
    double = String(v.rv_door_layout).startsWith("doppia");
  const result = {
    plan: null as ScenaSerramento | null,
    warnings,
    title: sliding
      ? "Scorrimento · vista dall’alto"
      : "Ripiegamento · vista dall’alto",
    caption:
      "LATO B in alto · LATO A in basso. Schema illustrativo, non in scala; non certifica la corsa, la luce netta o l’ingombro massimo.",
    labels: { top: "LATO B", bottom: "LATO A" },
  };
  if (!Number.isFinite(width) || width <= 0 || width > 100000) {
    warnings.push(
      "Larghezza del modulo non valida: nessun movimento rappresentato.",
    );
    return result;
  }
  if (!sliding && !folding) return result;
  if ((!double || folding) && !["sx", "dx"].includes(side)) {
    warnings.push(
      "Scorrimento / raccolta: conferma sinistra o destra guardando dal lato A; nessun movimento viene presunto.",
    );
    return result;
  }
  if (folding && double) {
    warnings.push(
      "Due moduli a libro / soffietto: allega lo schema del produttore; ripiegamenti multipli non ricostruiti automaticamente.",
    );
    return result;
  }
  if (sliding && double && (!split || split >= width)) {
    warnings.push(
      "Scorrevole doppia: divisione del modulo da confermare prima di rappresentare le due ante.",
    );
    return result;
  }
  if (
    type === "scorrevole_esterno" &&
    !["a", "b"].includes(String(v.rv_door_slide_face))
  ) {
    warnings.push(
      "Scorrevole esterno muro: conferma se pannello e binario sono sul lato A o B; nessuna faccia della parete viene scelta automaticamente.",
    );
    return result;
  }
  const frame = width * 0.035;
  const x0 = sliding ? width * 1.2 : width * 0.15,
    x1 = x0 + width,
    y = sliding ? width * 0.4 : width * 0.7;
  const scene: ScenaSerramento = {
    larghezza: sliding ? width * 3.4 : width * 1.3,
    altezza: sliding ? width * 0.8 : width * 1.4,
    sporgenza: 0,
    stile: "scheda",
    quote: [],
    forme: [
      rect("parete", 0, y - frame * 2, x0, frame * 4),
      rect(
        "parete",
        x1,
        y - frame * 2,
        (sliding ? width * 3.4 : width * 1.3) - x1,
        frame * 4,
      ),
    ],
  };
  const arrow = (from: number, to: number, atY: number) => {
    const t = Math.sign(to - from) * frame;
    scene.forme.push(
      line(
        [
          [from, atY],
          [to, atY],
          [to - t, atY - frame],
          [to, atY],
          [to - t, atY + frame],
        ],
        true,
      ),
    );
  };
  if (sliding) {
    const pocket = type === "scorrevole_scomparsa",
      atY = pocket
        ? y
        : y + (v.rv_door_slide_face === "a" ? 1 : -1) * frame * 3;
    const widths = double ? [split!, width - split!] : [width];
    let cursor = x0;
    widths.forEach((w, i) => {
      const left = double ? i === 0 : side === "sx",
        openX = left ? cursor - w : cursor + w;
      scene.forme.push(
        rect("pannello", cursor, atY - frame * 0.25, w, frame * 0.5),
      );
      if (pocket)
        scene.forme.push(
          rect(
            "ispezione",
            openX - frame * 0.4,
            y - frame * 1.4,
            w + frame * 0.8,
            frame * 2.8,
          ),
        );
      scene.forme.push(
        line(
          [
            [openX, atY],
            [openX + w, atY],
          ],
          true,
          true,
        ),
      );
      arrow(
        cursor + w / 2,
        cursor + w / 2 + (left ? -w : w) * 0.65,
        atY + frame * 2.6,
      );
      cursor += w;
    });
    const totalTrack = positive(v.rv_door_track_length);
    result.caption += ` ${pocket ? "Tasche di raccolta simboliche, non dimensionate dal vano." : `Pannello esterno muro sul lato ${v.rv_door_slide_face === "a" ? "A" : "B"}.`} Tratto continuo: posizione chiusa; rosso tratteggiato: posizione aperta indicativa.${totalTrack ? ` Binario rilevato ${totalTrack} mm.` : " Binario e corsa da rilevare."}`;
    for (const [key, label] of [
      ["rv_door_free_left", "sinistra"],
      ["rv_door_free_right", "destra"],
    ]) {
      const free = positive(v[key]);
      if (free)
        result.caption += ` Raccolta ${label} rilevata ${free} mm (compatibilità da verificare).`;
    }
  } else {
    const divisions = foldingDivisions(width, v),
      toward = v.rv_door_fold_toward;
    if (!divisions || !["a", "b"].includes(String(toward))) {
      warnings.push(
        "Porta a libro / soffietto: conferma composizione dei pannelli e lato A/B del ripiegamento; nessun pacchetto o divisorio viene inventato.",
      );
      return result;
    }
    if (type === "a_soffietto") {
      warnings.push(
        "Soffietto: pannelli riportati nel frontale; cinematismo e ingombro del pacchetto richiedono lo schema del produttore.",
      );
      return result;
    }
    const part =
      v.rv_door_fold_layout === "simmetrica"
        ? width / 2
        : positive(v.rv_door_fold_split_mm)!;
    const other = width - part,
      reach = Math.min(part, other) * 0.85,
      sign = toward === "a" ? 1 : -1,
      dir = side === "sx" ? 1 : -1,
      pivot = side === "sx" ? x0 : x1;
    const joint: [number, number] = [
      pivot + dir * Math.sqrt(part * part - reach * reach),
      y + sign * reach,
    ];
    const end: [number, number] = [
      joint[0] + dir * Math.sqrt(other * other - reach * reach),
      y,
    ];
    scene.forme.push(
      line(
        [
          [x0, y],
          [x1, y],
        ],
        false,
        true,
      ),
      line([[pivot, y], joint, end], true),
    );
    scene.forme.push(
      rect(
        "cerniera",
        joint[0] - frame * 0.12,
        joint[1] - frame * 0.12,
        frame * 0.24,
        frame * 0.24,
      ),
    );
    arrow(
      (x0 + x1) / 2,
      (x0 + x1) / 2 + (side === "sx" ? -1 : 1) * width * 0.2,
      y - sign * frame * 3,
    );
    result.caption += ` Due pannelli ${v.rv_door_fold_layout === "simmetrica" ? "simmetrici" : "asimmetrici"}, raccolta ${side === "sx" ? "a sinistra" : "a destra"} verso il lato ${toward === "a" ? "A" : "B"}. Rosso: posizione intermedia illustrativa, non apertura massima. Profili e ferramenta esclusi dai calcoli.`;
  }
  const clear = positive(v.rv_door_clear_width);
  if (clear)
    result.caption += ` Luce netta rilevata separatamente: ${clear} mm.`;
  return { ...result, plan: scene };
}
