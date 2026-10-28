/** Survey-only assembly diagrams. No supplier allowances, performance or order sizes are inferred. */
import type { FieldDefinition, FieldSection } from "@/types/surveys";
import type {
  ScenaSerramento,
  Forma,
} from "@/lib/serramenti/disegnoSerramento";
import { measuredScene } from "./windowComponentScenes";

type Values = Record<string, unknown>;
export type WindowSystem = {
  title: string;
  measurements: Array<{ key: string; label: string; value: number | null }>;
  figures: Array<{ title: string; scene: ScenaSerramento; caption: string }>;
  notes: string[];
  checks: string[];
};
const dimension = (key: string, label: string): FieldDefinition => ({
  key,
  label,
  type: "dimension",
  unit: "mm",
  min: 0,
  max: 100000,
  step: 0.1,
  width: 6,
});
const select = (
  key: string,
  label: string,
  options: string[][],
): FieldDefinition => ({
  key,
  label,
  type: "select",
  width: 6,
  options: options.map(([value, label]) => ({ value, label })),
});
const text = (key: string, label: string): FieldDefinition => ({
  key,
  label,
  type: "text",
  width: 12,
});
const activeMono = {
  field: "rv_monoblock_presence",
  operator: "in" as const,
  value: ["esistente", "nuovo"],
};
const projecting = {
  field: "rv_guide_kind",
  operator: "eq" as const,
  value: "sporgere",
};
const PROJECT = [
  ["rv_project_width", "Telaio a sporgere · larghezza esterna"],
  ["rv_project_height", "Telaio a sporgere · altezza esterna"],
  [
    "rv_project_moving_length",
    "Guida mobile · lunghezza dal perno al bordo inferiore",
  ],
  ["rv_project_open", "Sporgenza orizzontale aperta · dal piano chiuso"],
  ["rv_project_closed_depth", "Ingombro in profondità a telaio chiuso"],
  ["rv_project_space", "Spazio esterno libero dal piano chiuso"],
] as const;
const MONO = [
  ["rv_monoblock_width", "Monoblocco · larghezza esterna totale"],
  ["rv_monoblock_height", "Monoblocco · altezza esterna totale"],
  ["rv_monoblock_depth", "Monoblocco · profondità totale"],
  ["rv_monoblock_clear_width", "Monoblocco · luce interna larghezza"],
  ["rv_monoblock_clear_height", "Monoblocco · luce interna altezza"],
  ["rv_monoblock_shoulder_sx", "Spalla SX · ingombro frontale"],
  ["rv_monoblock_shoulder_dx", "Spalla DX · ingombro frontale"],
  ["rv_monoblock_box_height", "Cassonetto integrato · altezza"],
  ["rv_monoblock_bottom_height", "Sottobancale / quarto lato · altezza"],
] as const;
export const WINDOW_SYSTEM_MEASURES = new Set<string>(
  [...PROJECT, ...MONO].map(([key]) => key),
);
export function projectingGuideFields(): FieldDefinition[] {
  return [
    select("rv_guide_kind", "Configurazione guide tapparella", [
      ["incassate", "Guide fisse incassate"],
      ["sovrapposte", "Guide fisse sovrapposte"],
      ["sporgere", "Guide / telaio a sporgere"],
      ["altro", "Altro sistema"],
      ["da_verificare", "Da rilevare"],
    ]),
    ...[
      select("rv_project_supply", "Telaio a sporgere · intervento", [
        ["riuso", "Esistente da riutilizzare, previa verifica"],
        ["sostituzione", "Esistente da sostituire"],
        ["nuovo", "Nuovo da fornire"],
        ["da_verificare", "Da verificare"],
      ]),
      select(
        "rv_project_control",
        "Manovra telaio a sporgere · non motore del telo",
        [
          ["laterali", "Manovre laterali"],
          ["centrale", "Manovra centrale"],
          ["altro", "Altro / da descrivere"],
          ["da_verificare", "Da rilevare"],
        ],
      ),
      ...PROJECT.map(([key, label]) => dimension(key, label)),
      text(
        "rv_project_model",
        "Telaio a sporgere · produttore, modello e scheda tecnica",
      ),
      text(
        "rv_project_obstacles",
        "Ostacoli esterni, fissaggi, fermo e interferenze con rete / infisso",
      ),
    ].map((f) => ({ ...f, show_if: projecting })),
  ];
}
export function monoblockSections(): FieldSection[] {
  return [
    {
      key: "rv_monoblock_presence",
      label: "Monoblocco · presenza e intervento",
      fields: [
        select("rv_monoblock_presence", "Monoblocco del serramento", [
          ["assente", "Non presente / non previsto"],
          ["esistente", "Esistente, da rilevare"],
          ["nuovo", "Nuovo da fornire / posare"],
          ["da_verificare", "Presenza da verificare"],
        ]),
      ],
    },
    {
      key: "rv_monoblock_details",
      label: "Monoblocco · componenti e quote autonome",
      show_if: activeMono,
      fields: [
        select("rv_monoblock_kind", "Tipo di sistema", [
          ["termico", "Monoblocco termoisolante del foro"],
          ["integrato", "Serramento e oscurante integrati"],
          ["altro", "Altro sistema, da descrivere"],
        ]),
        text(
          "rv_monoblock_model",
          "Monoblocco · produttore / modello / riferimento esecutivo",
        ),
        {
          key: "rv_monoblock_parts",
          label: "Componenti effettivamente inclusi nel sistema",
          type: "multiselect",
          width: 12,
          options: [
            ["spalle", "Spalle"],
            ["cassonetto", "Cassonetto"],
            ["sottobancale", "Sottobancale / quarto lato"],
            ["guide", "Guide tapparella"],
            ["tapparella", "Tapparella"],
            ["zanzariera", "Zanzariera / predisposizione"],
            ["frangisole", "Frangisole / altro oscurante"],
          ].map(([value, label]) => ({ value, label })),
          help: "Non seleziona automaticamente i complementi dell’infisso e non crea una seconda fornitura. Rileva ciascun componente nella relativa scheda.",
        },
        ...MONO.map(([key, label]) => dimension(key, label)),
        select(
          "rv_monoblock_inspection",
          "Monoblocco · lato d’ispezione cassonetto",
          [
            ["interno", "Interno"],
            ["esterno", "Esterno"],
            ["inferiore", "Inferiore"],
            ["non_previsto", "Cassonetto non previsto"],
            ["da_verificare", "Da rilevare"],
          ],
        ),
        select("rv_monoblock_action", "Monoblocco · lavorazione prevista", [
          ["mantenere", "Mantenere e verificare"],
          ["adattare", "Adattare, previa verifica tecnica"],
          ["sostituire", "Rimuovere e sostituire"],
          ["posare", "Nuova posa"],
          ["da_verificare", "Da definire"],
        ]),
        {
          ...text(
            "rv_monoblock_notes",
            "Raccordi, fissaggi, accessibilità, opere murarie e contenuto della fornitura",
          ),
          type: "textarea",
          help: "Quote del monoblocco, del foro e del serramento sono indipendenti. Prestazioni e tolleranze solo da scheda del produttore.",
        },
      ],
    },
  ];
}
const measure = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100000
    ? v
    : null;
const mm = (v: unknown): number | null =>
  measure(v) && Number(v) > 0 ? Number(v) : null;
const rect = (x: number, y: number, w: number, h: number): Forma => ({
  kind: "rect",
  ruolo: "telaio",
  x,
  y,
  w,
  h,
});
const line = (points: Array<[number, number]>, red = false): Forma => ({
  kind: "poly",
  ruolo: red ? "simbolo" : "pannelloLinea",
  punti: points,
});
export function windowSystem(type: string, v: Values): WindowSystem | null {
  if (type === "tapparella_standalone" && v.rv_guide_kind === "sporgere") {
    const result: WindowSystem = {
      title: "Guide / telaio a sporgere",
      measurements: PROJECT.map(([key, label]) => ({
        key,
        label,
        value: measure(v[key]),
      })),
      figures: [],
      checks: [],
      notes: [
        "Schema separato dal telo. Nessuna maggiorazione o tolleranza di taglio automatica. Manovra del telaio distinta dal comando del telo.",
      ],
    };
    const w = mm(v.rv_project_width),
      h = mm(v.rv_project_height),
      l = mm(v.rv_project_moving_length),
      p = mm(v.rv_project_open),
      space = measure(v.rv_project_space);
    if (w && h)
      result.figures.push({
        title: "Telaio chiuso · ingombro frontale",
        scene: measuredScene(w, h, [
          line([
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
            [0, 0],
          ]),
        ]),
        caption:
          "Quote esterne del telaio a sporgere, non dimensioni del telo. Profili illustrativi.",
      });
    if (l && p && p < l) {
      const drop = Math.sqrt(l * l - p * p),
        width = p * 1.25;
      result.figures.push({
        title: "Apertura a sporgere · vista laterale",
        scene: {
          ...measuredScene(width, l, [
            line([
              [0, 0],
              [0, l],
            ]),
            line(
              [
                [0, 0],
                [p, drop],
              ],
              true,
            ),
            line([
              [0, l],
              [p, drop],
            ]),
          ]),
          quote: [
            {
              orientamento: "h",
              lato: "sotto",
              da: 0,
              a: p,
              testo: `Sporgenza ${p} mm`,
            },
          ],
        },
        caption: `Perno in alto, esterno a destra. Guida mobile rilevata ${l} mm; posizione teorica dalle due quote. Bracci e fissaggi simbolici, cinematica reale da scheda produttore.`,
      });
    } else
      result.checks.push(
        "Per lo schema aperto rileva lunghezza guida mobile e sporgenza orizzontale positiva, minore della lunghezza. Nessun angolo predefinito.",
      );
    if (p && space != null && p > space)
      result.checks.push(
        "La sporgenza aperta supera lo spazio esterno libero rilevato: verificare interferenze e arresti.",
      );
    if (!v.rv_project_control || v.rv_project_control === "da_verificare")
      result.checks.push(
        "Manovra del telaio a sporgere da rilevare; non viene dedotta dal motore della tapparella.",
      );
    return result;
  }
  if (
    type !== "infisso" ||
    !["esistente", "nuovo"].includes(String(v.rv_monoblock_presence))
  )
    return null;
  const result: WindowSystem = {
    title: "Monoblocco del serramento",
    measurements: MONO.map(([key, label]) => ({
      key,
      label,
      value: measure(v[key]),
    })),
    figures: [],
    checks: [],
    notes: [
      "Ingombro monoblocco, luce interna, foro e telaio del serramento sono quote autonome: nessuna misura finita è ricavata per differenza. Le figure non sono sezioni esecutive.",
      "I complementi restano schede tecniche del sistema, non forniture aggiuntive automatiche. Verifica inclusioni ed esclusioni prima del preventivo.",
    ],
  };
  const w = mm(v.rv_monoblock_width),
    h = mm(v.rv_monoblock_height),
    cw = mm(v.rv_monoblock_clear_width),
    ch = mm(v.rv_monoblock_clear_height);
  const parts = Array.isArray(v.rv_monoblock_parts) ? v.rv_monoblock_parts : [];
  if (w && h) {
    const t = Math.min(w, h) * 0.05;
    const sx = mm(v.rv_monoblock_shoulder_sx),
      dx = mm(v.rv_monoblock_shoulder_dx),
      top = mm(v.rv_monoblock_box_height),
      bottom = mm(v.rv_monoblock_bottom_height);
    const band = (size: number | null, max: number) =>
      size && size < max ? size : t;
    const forms: Forma[] = [];
    if (parts.includes("spalle"))
      forms.push(
        rect(0, 0, band(sx, w), h),
        rect(w - band(dx, w), 0, band(dx, w), h),
      );
    if (parts.includes("cassonetto")) forms.push(rect(0, 0, w, band(top, h)));
    if (parts.includes("sottobancale"))
      forms.push(rect(0, h - band(bottom, h), w, band(bottom, h)));
    forms.push(
      line([
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
        [0, 0],
      ]),
    );
    result.figures.push({
      title: "Monoblocco · ingombro esterno",
      scene: measuredScene(w, h, forms),
      caption:
        "Parti evidenziate solo se dichiarate incluse. Frontali rilevati rappresentati; in assenza, spessori simbolici. La luce interna resta una quota autonoma.",
    });
  } else
    result.checks.push(
      "Ingombro esterno del monoblocco incompleto: rileva larghezza e altezza totali, senza usare quelle dell’infisso.",
    );
  if (cw && ch)
    result.figures.push({
      title: "Monoblocco · luce interna autonoma",
      scene: measuredScene(cw, ch, [
        line([
          [0, 0],
          [cw, 0],
          [cw, ch],
          [0, ch],
          [0, 0],
        ]),
      ]),
      caption:
        "Luce interna dichiarata, su scala propria: non è la misura d’ordine del serramento.",
    });
  if ((w && cw && cw >= w) || (h && ch && ch >= h))
    result.checks.push(
      "Luce interna non inferiore all’ingombro esterno del monoblocco: verificare i riferimenti delle quote.",
    );
  if (!v.rv_monoblock_model)
    result.checks.push(
      "Monoblocco: modello e sezione esecutiva del produttore da acquisire.",
    );
  if (!parts.length)
    result.checks.push(
      "Monoblocco: componenti inclusi da confermare, nessuna integrazione viene presunta.",
    );
  if (
    v.rv_guide_kind === "sporgere" &&
    Array.isArray(v.complementi) &&
    v.complementi.includes("tapparella")
  )
    result.checks.push(
      "Monoblocco e telaio a sporgere: verificare compatibilità, fissaggi e accessibilità sulla sezione del produttore.",
    );
  return result;
}
