/** Survey-only door configuration. No supplier allowances or certification inferred. */
import type {
  ElementTypeDefinition,
  FieldDefinition,
  FieldSection,
  SurveyTemplateRow,
} from "@/types/surveys";
import {
  cornice,
  specchiaScena,
  type Forma,
  type ScenaSerramento,
} from "@/lib/serramenti/disegnoSerramento";
import { doorPlan, measuredScene } from "./windowComponentScenes";
import { installationFields } from "./installationEnvelope";
import {
  doorMovementPlan,
  doorMovementSection,
  foldingDivisions,
} from "./doorMovement";
type Values = Record<string, unknown>;
export const isSurveyDoor = (type: ElementTypeDefinition) =>
  ["portoncino_blindato", "porta_interna"].includes(type.key);
const choice = (
  key: string,
  label: string,
  pairs: string[][],
): FieldDefinition => ({
  key,
  label,
  type: "select",
  width: 6,
  options: pairs.map(([value, label]) => ({ value, label })),
  ...(key === "tipologia" ? { required: true } : {}),
});
const size = (key: string, label: string): FieldDefinition => ({
  key,
  label,
  type: "dimension",
  unit: "mm",
  min: 0,
  max: 100000,
  step: 0.1,
  width: 6,
});
const note = (key: string, label: string): FieldDefinition => ({
  key,
  label,
  type: "text",
  width: 12,
});
export const INTERNAL_DOOR_TYPE: ElementTypeDefinition = {
  key: "porta_interna",
  label: "Porta interna",
  label_plural: "Porte interne",
  icon: "door-open",
  estimate_category: "porte_interne",
  allow_quantity: true,
  sections: [
    {
      key: "misure_porta",
      label: "Vano porta e tipologia",
      default_open: true,
      fields: [
        choice("tipologia", "Tipologia porta interna", [
          ["battente", "Battente"],
          ["scorrevole_esterno", "Scorrevole esterno muro"],
          ["scorrevole_scomparsa", "Scorrevole a scomparsa"],
          ["a_libro", "A libro"],
          ["a_soffietto", "A soffietto"],
          ["rototraslante", "Rototraslante"],
        ]),
        { ...size("larghezza", "Larghezza vano rilevata"), required: true },
        { ...size("altezza", "Altezza totale vano rilevata"), required: true },
        size("spessore_muro", "Spessore muro finito"),
        choice("materiale", "Materiale porta", [
          ["laminato", "Laminato"],
          ["laccato", "Laccato"],
          ["legno_massello", "Legno massello"],
          ["vetro", "Vetro"],
          ["alluminio", "Alluminio"],
        ]),
      ],
    },
  ],
  required_photos: [
    { key: "vano_porta", label: "Vano porta con riferimento metrico" },
    { key: "lato_a", label: "Lato A e ingombro di apertura" },
    { key: "lato_b", label: "Lato B e parete / controtelaio" },
  ],
};
/** Add the standard internal-door product without changing saved/company-defined schemas. */
export function withSurveyDoorProducts(
  template: SurveyTemplateRow,
): SurveyTemplateRow {
  const types = template.schema.element_types;
  if (
    !template.is_system ||
    !types.some((t) => t.key === "infisso") ||
    !types.some((t) => t.key === "portoncino_blindato") ||
    types.some((t) => t.key === "porta_interna")
  )
    return template;
  return {
    ...template,
    schema: {
      ...template.schema,
      element_types: [...types, structuredClone(INTERNAL_DOOR_TYPE)],
    },
  };
}
export function doorSurveySections(
  type: ElementTypeDefinition,
): FieldSection[] {
  const interior = type.key === "porta_interna";
  const sections: FieldSection[] = [
    {
      key: "rv_door_configuration",
      label: interior
        ? "Configurazione della porta interna"
        : "Blindato · ante e sopraluce",
      fields: [
        choice("rv_door_layout", "Composizione delle ante", [
          ["singola", "Una anta"],
          ["doppia_simmetrica", "Due ante simmetriche"],
          ["doppia_asimmetrica", "Due ante asimmetriche"],
        ]),
        choice(
          "rv_door_sidelights",
          "Fiancoluce · vista dal lato di riferimento",
          [
            ["no", "Assenti"],
            ["sx", "Solo sinistro"],
            ["dx", "Solo destro"],
            ["entrambi", "Sinistro e destro"],
          ],
        ),
        {
          ...size(
            "rv_door_sidelight_left_width",
            "Larghezza fiancoluce sinistro (modulo incluso nel totale)",
          ),
          show_if: {
            field: "rv_door_sidelights",
            operator: "in",
            value: ["sx", "entrambi"],
          },
        },
        {
          ...size(
            "rv_door_sidelight_right_width",
            "Larghezza fiancoluce destro (modulo incluso nel totale)",
          ),
          show_if: {
            field: "rv_door_sidelights",
            operator: "in",
            value: ["dx", "entrambi"],
          },
        },
        {
          ...note(
            "rv_door_sidelight_glass",
            "Fiancoluce · vetro, privacy e prestazioni richieste",
          ),
          show_if: {
            field: "rv_door_sidelights",
            operator: "in",
            value: ["sx", "dx", "entrambi"],
          },
        },
        choice("rv_door_panel_design", "Aspetto del pannello (illustrativo)", [
          ["liscio", "Liscio"],
          ["orizzontale", "Scanalature orizzontali"],
          ["produttore", "Come disegno del produttore"],
        ]),
        {
          ...choice(
            "rv_door_active_side",
            `Anta principale vista ${interior ? "dal lato A" : "dall’esterno"}`,
            [
              ["sx", "Sinistra"],
              ["dx", "Destra"],
            ],
          ),
          show_if: {
            field: "rv_door_layout",
            operator: "in",
            value: ["doppia_simmetrica", "doppia_asimmetrica"],
          },
        },
        {
          ...choice("rv_door_secondary", "Seconda anta", [
            ["semifissa", "Semifissa apribile"],
            ["fissa", "Fissa non apribile"],
            ["da_verificare", "Da verificare"],
          ]),
          show_if: {
            field: "rv_door_layout",
            operator: "in",
            value: ["doppia_simmetrica", "doppia_asimmetrica"],
          },
        },
        {
          ...size(
            "rv_door_split_mm",
            `Quota divisoria dal bordo ${interior ? "sinistro lato A" : "sinistro esterno"}`,
          ),
          help: "Dal bordo sinistro del solo modulo porta, esclusi i fiancoluce. Suddivisione del modulo, non larghezza netta dell’anta: nessun profilo o gioco viene sottratto.",
          show_if: {
            field: "rv_door_layout",
            operator: "eq",
            value: "doppia_asimmetrica",
          },
        },
        choice("rv_door_toplight", "Sopraluce", [
          ["no", "Assente"],
          ["fisso", "Fisso vetrato"],
          ["vasistas", "Apribile a vasistas"],
        ]),
        {
          ...size(
            "rv_door_toplight_height",
            "Altezza sopraluce inclusa nell’altezza totale",
          ),
          show_if: {
            field: "rv_door_toplight",
            operator: "in",
            value: ["fisso", "vasistas"],
          },
        },
        {
          ...note(
            "rv_door_toplight_glass",
            "Vetro del sopraluce / sicurezza / privacy",
          ),
          show_if: {
            field: "rv_door_toplight",
            operator: "in",
            value: ["fisso", "vasistas"],
          },
        },
      ],
    },
    {
      key: "rv_door",
      label: interior
        ? "Apertura · riferimento lato A"
        : "Portoncino · verso reale di apertura",
      description: interior
        ? "Identifica le stanze A e B. Cerniere, scorrimento e raccolta si leggono dal lato A."
        : "Guarda la porta dall’esterno. Anche la consueta apertura a spingere richiede conferma.",
      fields: [
        ...(interior
          ? [
              note("rv_door_side_a", "Lato A · stanza da cui si guarda"),
              note("rv_door_side_b", "Lato B · stanza di destinazione"),
            ]
          : []),
        {
          ...choice(
            "rv_door_hinge",
            interior
              ? "Cerniere viste dal lato A"
              : "Cerniere viste dall’esterno",
            [
              ["sx", "Sinistra"],
              ["dx", "Destra"],
            ],
          ),
          show_if: interior
            ? {
                field: "tipologia",
                operator: "in",
                value: ["battente", "rototraslante"],
              }
            : undefined,
        },
        {
          ...choice(
            "rv_door_swing",
            interior
              ? "Dal lato A la porta si apre"
              : "Dal lato esterno la porta si apre",
            [
              [
                "spingere",
                interior
                  ? "Spingendo verso il lato B"
                  : "Spingendo verso l’interno",
              ],
              [
                "tirare",
                interior
                  ? "Tirando verso il lato A"
                  : "Tirando verso l’esterno",
              ],
            ],
          ),
          show_if: interior
            ? {
                field: "tipologia",
                operator: "in",
                value: ["battente", "rototraslante"],
              }
            : undefined,
        },
        ...(interior
          ? [
              {
                ...choice(
                  "rv_door_slide_side",
                  "Scorre / si raccoglie (visto dal lato A)",
                  [
                    ["sx", "A sinistra"],
                    ["dx", "A destra"],
                  ],
                ),
                show_if: {
                  field: "tipologia",
                  operator: "in" as const,
                  value: [
                    "scorrevole_esterno",
                    "scorrevole_scomparsa",
                    "a_libro",
                    "a_soffietto",
                  ],
                },
              },
            ]
          : []),
        note("rv_door_model", "Produttore / modello / pannello / ferramenta"),
      ],
    },
    {
      key: "rv_door_installation",
      label: "Controtelaio, posa e dotazioni",
      fields: [
        choice("rv_door_counterframe", "Controtelaio · fornitura", [
          ["nuovo", "Da acquistare / fornire nuovo"],
          ["riutilizzo", "Esistente · riutilizzo da verificare"],
          ["non_previsto", "Non previsto dal sistema scelto"],
          ["da_verificare", "Da verificare in sopralluogo"],
        ]),
        choice("rv_door_frame_state", "Telaio / controtelaio · stato di posa", [
          ["da_murare", "Da murare / posare"],
          ["murato", "Già murato · da verificare"],
          ["da_sostituire", "Murato da rimuovere / sostituire"],
          ["da_verificare", "Stato da verificare"],
        ]),
        size("rv_door_frame_width", "Controtelaio · larghezza rilevata"),
        size("rv_door_frame_height", "Controtelaio · altezza rilevata"),
        size("rv_door_frame_depth", "Controtelaio · profondità / spessore"),
        ...installationFields("door", interior),
        note(
          "rv_door_frame_notes",
          "Controtelaio · stato, fissaggi, compatibilità e opere murarie",
        ),
        note("rv_door_threshold", "Soglia / pavimento finito / dislivello"),
        note(
          "rv_door_hardware",
          "Maniglie, serratura, cilindro, cerniere e accessori",
        ),
        ...(interior
          ? [
              note(
                "rv_door_finish_a",
                "Finitura lato A · pannello, materiale e codice",
              ),
              note(
                "rv_door_finish_b",
                "Finitura lato B · pannello, materiale e codice",
              ),
            ]
          : [
              note(
                "rv_door_panel_internal",
                "Pannello interno · materiale e modello",
              ),
              note(
                "rv_door_panel_external",
                "Pannello esterno · materiale e modello",
              ),
              note(
                "rv_door_performance",
                "Prestazioni richieste · RC, acustica, termica / documenti da verificare",
              ),
            ]),
      ],
    },
    ...(interior ? [doorMovementSection()] : []),
  ];
  if (!interior) return sections;
  return sections.map((s) => ({
    ...s,
    fields: s.fields.map((f) => {
      if (f.key === "rv_door_slide_side")
        return {
          ...f,
          show_if: [
            ...(Array.isArray(f.show_if)
              ? f.show_if
              : f.show_if
                ? [f.show_if]
                : []),
            {
              field: "rv_door_layout",
              operator: "not_in" as const,
              value: [
                "doppia_simmetrica",
                "doppia_asimmetrica",
                "doppia_non_definita",
              ],
            },
          ],
        };
      if (f.key === "rv_door_layout")
        return {
          ...f,
          help: "Per il libro un modulo è il gruppo di pannelli, non il numero dei pannelli. Le doppie scorrevoli rappresentano due ante contrapposte; altri sistemi richiedono lo schema del produttore.",
        };
      if (!["rv_door_active_side", "rv_door_secondary"].includes(f.key))
        return f;
      return {
        ...f,
        show_if: [
          ...(Array.isArray(f.show_if)
            ? f.show_if
            : f.show_if
              ? [f.show_if]
              : []),
          { field: "tipologia", operator: "eq" as const, value: "battente" },
        ],
      };
    }),
  }));
}
const str = (v: unknown) => (typeof v === "string" ? v : "");
const positive = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
const rect = (
  ruolo: Extract<Forma, { kind: "rect" }>["ruolo"],
  x: number,
  y: number,
  w: number,
  h: number,
): Forma => ({ kind: "rect", ruolo, x, y, w, h });
const poly = (
  punti: [number, number][],
  symbol = false,
  dashed = false,
): Forma => ({
  kind: "poly",
  ruolo: symbol ? "simbolo" : "pannelloLinea",
  punti,
  tratteggio: dashed,
});
export function doorSurveyScene(
  w: number,
  h: number,
  v: Values,
  outside: boolean,
  interior = false,
): {
  scene: ScenaSerramento;
  warnings: string[];
  plan: ScenaSerramento | null;
  planCaption?: string;
  planTitle?: string;
  planLabels?: { top: string; bottom: string };
} {
  const warnings: string[] = [];
  const sideKind = str(v.rv_door_sidelights);
  const sideL = ["sx", "entrambi"].includes(sideKind)
    ? positive(v.rv_door_sidelight_left_width)
    : 0;
  const sideR = ["dx", "entrambi"].includes(sideKind)
    ? positive(v.rv_door_sidelight_right_width)
    : 0;
  if (sideL === null || sideR === null || sideL + sideR >= w)
    return {
      scene: measuredScene(w, h, [
        ...cornice(0, 0, w, h, Math.min(w, h) * 0.035, "telaio"),
        rect(
          "pannello",
          Math.min(w, h) * 0.035,
          Math.min(w, h) * 0.035,
          w - Math.min(w, h) * 0.07,
          h - Math.min(w, h) * 0.07,
        ),
      ]),
      warnings: [
        "Fiancoluce: rileva le larghezze dei moduli laterali, positive e con somma minore della larghezza totale. Nessun vetro o modulo viene dimensionato automaticamente.",
      ],
      plan: null,
    };
  const doorW = w - sideL - sideR;
  const type = interior ? str(v.tipologia) : "battente";
  const layout =
    str(v.rv_door_layout) ||
    (/2_?ant|doppia/.test(str(v.tipologia)) || v.rv_total_leaves === 2
      ? "doppia_non_definita"
      : "singola");
  const double = layout.startsWith("doppia");
  let split = double
    ? layout === "doppia_simmetrica"
      ? doorW / 2
      : positive(v.rv_door_split_mm)
    : doorW;
  if (double && (!split || split >= doorW)) {
    warnings.push(
      "Due ante: rileva la quota divisoria e conferma se sono simmetriche o asimmetriche; nessuna suddivisione viene inventata.",
    );
    split = null;
  }
  if (layout === "doppia_simmetrica")
    warnings.push(
      "Suddivisione simmetrica illustrativa: quote nette delle ante e profili da verificare col produttore.",
    );
  const topKind = str(v.rv_door_toplight),
    topMeasured = positive(v.rv_door_toplight_height);
  const topRequested = ["fisso", "vasistas"].includes(topKind);
  const top = topRequested && topMeasured && topMeasured < h ? topMeasured : 0;
  if (topRequested && !top)
    warnings.push(
      "Sopraluce: rileva un’altezza positiva minore dell’altezza totale; il divisorio non viene inventato.",
    );
  const t =
      Math.min(
        doorW,
        h,
        ...(sideL ? [sideL] : []),
        ...(sideR ? [sideR] : []),
        ...(top ? [top] : []),
      ) * 0.035,
    y = top,
    bodyH = h - top;
  const forms: Forma[] = [...cornice(0, 0, w, h, t, "telaio")];
  if (top) {
    forms.push(
      rect("vetro", t, t, w - 2 * t, Math.max(1, top - 2 * t)),
      rect("telaio", t, top - t / 2, w - 2 * t, t),
    );
    if (topKind === "vasistas")
      forms.push(
        poly(
          [
            [t, top - t],
            [w / 2, t],
            [w - t, top - t],
          ],
          true,
          outside,
        ),
      );
  }
  if (sideL)
    forms.push(
      rect("vetro", t, y + t, Math.max(1, sideL - 2 * t), bodyH - 2 * t),
      rect("telaio", sideL - t / 2, y, t, bodyH),
    );
  if (sideR)
    forms.push(
      rect(
        "vetro",
        w - sideR + t,
        y + t,
        Math.max(1, sideR - 2 * t),
        bodyH - 2 * t,
      ),
      rect("telaio", w - sideR - t / 2, y, t, bodyH),
    );
  if (sideL || sideR)
    warnings.push(
      "Fiancoluce compresi nelle quote totali; la pianta mostra solo il modulo porta. Vetri, profili e prestazioni richiedono verifica del produttore.",
    );
  const boundaries =
    split && double ? [sideL, sideL + split, w - sideR] : [sideL, w - sideR];
  const active = str(v.rv_door_active_side);
  const hinges = str(v.rv_door_hinge),
    swing = str(v.rv_door_swing);
  const sliding = ["scorrevole_esterno", "scorrevole_scomparsa"].includes(type),
    folding = ["a_libro", "a_soffietto"].includes(type);
  const moving = sliding || folding;
  if (!moving && double && !["sx", "dx"].includes(active))
    warnings.push(
      "Due ante: indica l’anta principale guardando dal lato di riferimento.",
    );
  if (
    !moving &&
    double &&
    !["semifissa", "fissa"].includes(str(v.rv_door_secondary))
  )
    warnings.push(
      "Seconda anta: conferma se semifissa apribile o fissa; apertura secondaria non dedotta.",
    );
  if (
    !moving &&
    (!["sx", "dx"].includes(hinges) || !["spingere", "tirare"].includes(swing))
  )
    warnings.push(
      "Cerniere e spingere o tirare da rilevare esplicitamente dal lato di riferimento.",
    );
  const conflict =
    !moving &&
    double &&
    ["sx", "dx"].includes(active) &&
    hinges &&
    active !== hinges;
  if (conflict)
    warnings.push(
      "Anta principale e cerniere discordanti per una doppia anta con cerniere sui montanti esterni: verifica la configurazione; nessun verso viene dedotto.",
    );
  if (type === "rototraslante")
    warnings.push(
      "Rototraslante: ingombro e movimento dipendono dalla ferramenta; allegare lo schema del produttore.",
    );
  if (
    ![
      "battente",
      "scorrevole_esterno",
      "scorrevole_scomparsa",
      "a_libro",
      "a_soffietto",
      "rototraslante",
    ].includes(type)
  )
    warnings.push(
      "Tipologia di porta da definire: solo ingombro e pannello illustrativo.",
    );
  const arrow = (x1: number, x2: number, atY: number) => {
    const d = Math.sign(x2 - x1) * w * 0.045;
    forms.push(
      poly(
        [
          [x1, atY],
          [x2, atY],
        ],
        true,
      ),
      poly(
        [
          [x2 - d, atY - h * 0.025],
          [x2, atY],
          [x2 - d, atY + h * 0.025],
        ],
        true,
      ),
    );
  };
  boundaries.slice(0, -1).forEach((x, i) => {
    const width = boundaries[i + 1] - x,
      left = x + t,
      right = x + width - t;
    forms.push(
      rect(
        interior && v.materiale === "vetro" ? "vetro" : "pannello",
        left,
        y + t,
        Math.max(1, width - 2 * t),
        Math.max(1, bodyH - 2 * t),
      ),
    );
    if (i) forms.push(rect("telaio", x - t / 2, y, t, bodyH));
    if (v.rv_door_panel_design === "orizzontale")
      for (let j = 1; j < 6; j++)
        forms.push(
          poly([
            [left, y + (bodyH * j) / 6],
            [right, y + (bodyH * j) / 6],
          ]),
        );
    const leafSide = double ? (i === 0 ? "sx" : "dx") : hinges;
    const isActive = !double || active === leafSide;
    if (
      type === "battente" &&
      split &&
      !conflict &&
      ["sx", "dx"].includes(leafSide) &&
      ["spingere", "tirare"].includes(swing) &&
      (!double || isActive || v.rv_door_secondary === "semifissa")
    ) {
      const tip = leafSide === "sx" ? right : left,
        root = leafSide === "sx" ? left : right;
      forms.push(
        poly(
          [
            [root, y + t * 2],
            [tip, y + bodyH / 2],
            [root, h - t * 2],
          ],
          true,
          outside ? swing === "spingere" : swing === "tirare",
        ),
      );
      [0.25, 0.75].forEach((k) =>
        forms.push(
          rect("cerniera", root - t * 0.2, y + bodyH * k, t * 0.4, t * 1.3),
        ),
      );
      if (isActive)
        forms.push(
          rect(
            "maniglia",
            tip + (leafSide === "sx" ? -t : t * 0.3),
            y + bodyH * 0.5,
            t * 0.7,
            t * 2,
          ),
        );
    }
    if (moving) {
      const side =
        sliding && double && split
          ? i === 0
            ? "sx"
            : "dx"
          : str(v.rv_door_slide_side);
      if ((!double || split) && ["sx", "dx"].includes(side))
        arrow(
          x + width * (side === "sx" ? 0.7 : 0.3),
          x + width * (side === "sx" ? 0.3 : 0.7),
          y + bodyH * 0.5,
        );
      else if (i === 0)
        warnings.push(
          "Scorrimento / raccolta della porta: indica il lato A e il lato di apertura.",
        );
      if (folding) {
        const divisions = double ? null : foldingDivisions(width, v);
        for (const fraction of divisions ?? [])
          forms.push(
            poly([
              [x + width * fraction, y + t],
              [x + width * fraction, h - t],
            ]),
          );
        if (!divisions && i === 0)
          warnings.push(
            "Pannelli a libro / soffietto: composizione da rilevare; nessuna divisione simmetrica o numero di pannelli predefinito.",
          );
      }
    }
  });
  if (sliding) {
    forms.push(rect("binario", 0, y, w, t * 0.55));
    if (type === "scorrevole_scomparsa")
      forms.push(
        poly(
          [
            [0, y + t * 2],
            [w, y + t * 2],
          ],
          false,
          true,
        ),
      );
    warnings.push(
      type === "scorrevole_scomparsa"
        ? "Controtelaio a scomparsa: verifica modello, spessore parete e vano di raccolta; tasca non dimensionata automaticamente."
        : "Scorrevole esterno muro: rileva parete libera, binario e ostacoli; corsa non dedotta dal solo vano.",
    );
  }
  if (interior && (!str(v.rv_door_side_a) || !str(v.rv_door_side_b)))
    warnings.push(
      "Porta interna: identifica le stanze dei lati A e B prima di confermare il verso.",
    );
  if (!v.rv_door_counterframe || v.rv_door_counterframe === "da_verificare")
    warnings.push(
      "Controtelaio: conferma se acquistarlo, verificarne il riutilizzo o se non è previsto.",
    );
  if (v.rv_door_frame_state === "da_murare")
    warnings.push(
      "Controtelaio da murare: definire fissaggi, quote da pavimento finito e opere murarie; ingombro illustrativo, non profilo esecutivo.",
    );
  if (v.rv_door_frame_state === "murato")
    warnings.push(
      "Controtelaio già murato: verificarne stato, misure, piombo e compatibilità col modello; il riutilizzo non è automatico.",
    );
  warnings.push(
    `${interior ? "Porta interna" : "Portoncino"}: pannello illustrativo; serratura, ferramenta e prestazioni fanno fede nei dati tecnici.`,
  );
  let scene = measuredScene(w, h, forms);
  if (top)
    scene.quote.push({
      orientamento: "v",
      lato: "dx",
      da: 0,
      a: top,
      testo: `Sopraluce ${top} mm`,
      segue: true,
    });
  if (split && double && v.rv_door_split_mm && layout !== "doppia_simmetrica")
    scene.quote.push({
      orientamento: "h",
      lato: "sotto",
      da: sideL,
      a: sideL + split,
      testo: `Divisorio ${split} mm · lato ${interior ? "A" : "esterno"}`,
      livello: 1,
      segue: true,
    });
  for (const [side, amount, from] of [
    ["SX", sideL, 0],
    ["DX", sideR, w - sideR],
  ] as const)
    if (amount)
      scene.quote.push({
        orientamento: "h",
        lato: "sotto",
        da: from,
        a: from + amount,
        testo: `Fiancoluce ${side} ${amount} mm`,
        livello: 2,
      });
  // Construct from outside / side A. Existing UI's internal view is side B for internal doors.
  if (!outside) scene = specchiaScena(scene, true);
  const motion = moving ? doorMovementPlan(doorW, v, split) : null;
  if (motion) warnings.push(...motion.warnings);
  const plan = moving
    ? motion!.plan
    : type !== "battente"
      ? null
      : !double
        ? doorPlan(doorW, hinges, swing)
        : split &&
            !conflict &&
            ["sx", "dx"].includes(active) &&
            ["sx", "dx"].includes(hinges) &&
            ["spingere", "tirare"].includes(swing)
          ? doubleDoorPlan(
              doorW,
              split,
              active,
              swing,
              v.rv_door_secondary === "semifissa",
            )
          : null;
  return {
    scene,
    warnings,
    plan,
    ...(motion
      ? {
          planCaption: motion.caption,
          planTitle: motion.title,
          planLabels: motion.labels,
        }
      : {}),
  };
}
function doubleDoorPlan(
  w: number,
  split: number,
  active: string,
  swing: string,
  secondary: boolean,
): ScenaSerramento {
  const inward = swing === "spingere",
    y = w * (inward ? 0.15 : 1.2),
    x0 = w * 0.15,
    x1 = x0 + w;
  const forms: Forma[] = [
    rect("parete", 0, y - w * 0.04, x0, w * 0.08),
    rect("parete", x1, y - w * 0.04, w * 0.15, w * 0.08),
    poly([
      [x0, y],
      [x1, y],
    ]),
  ];
  (["sx", "dx"] as const).forEach((side) => {
    if (side !== active && !secondary) return;
    const pivot = side === "sx" ? x0 : x1,
      length = side === "sx" ? split : w - split;
    const a0 = side === "sx" ? 0 : Math.PI,
      a1 = inward ? Math.PI / 2 : side === "sx" ? -Math.PI / 2 : Math.PI * 1.5;
    forms.push(
      poly(
        [
          [pivot, y],
          [pivot, y + (inward ? length : -length)],
        ],
        true,
        side !== active,
      ),
    );
    forms.push(
      poly(
        Array.from({ length: 25 }, (_, i) => {
          const a = a0 + ((a1 - a0) * i) / 24;
          return [pivot + Math.cos(a) * length, y + Math.sin(a) * length];
        }),
        true,
        side !== active,
      ),
    );
  });
  return {
    larghezza: w * 1.3,
    altezza: w * 1.35,
    sporgenza: 0,
    quote: [],
    forme: forms,
  };
}
