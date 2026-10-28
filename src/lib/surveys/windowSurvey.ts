/** Survey adapter. Stored dimensions keep their template units; drawing geometry is always mm.
 * Profiles are illustrative: no manufacturing allowance or supplier order is inferred here. */
import type {
  ElementTypeDefinition,
  FieldDefinition,
  FieldSection,
} from "@/types/surveys";
import {
  disegnaSerramento,
  type AntaDisegno,
  type ScenaSerramento,
  type SerramentoDisegno,
  type TipoAnta,
} from "@/lib/serramenti/disegnoSerramento";
import { disegnaPersiana } from "@/lib/serramenti/disegnoPersiana";
import { finituraDaEtichetta } from "@/lib/serramenti/finituraSerramento";
import { vetroDaEtichette } from "@/lib/serramenti/vetroSerramento";
import { boxScenes, mosquitoScene } from "./windowComponentScenes";
import { boxAxonometric, type BoxAxonometric } from "./boxAxonometric";
import {
  monoblockSections,
  projectingGuideFields,
  windowSystem,
  WINDOW_SYSTEM_MEASURES,
  type WindowSystem,
} from "./windowSystems";
import {
  installationFields,
  installationEnvelope,
  ENVELOPE_MEASURE_KEYS,
  type InstallationEnvelope,
} from "./installationEnvelope";
import {
  windowAbaco,
  windowAbacoSections,
  type WindowAbaco,
} from "./windowAbaco";
import {
  doorSurveySections,
  doorSurveyScene,
  isSurveyDoor,
} from "./doorSurvey";

export type WindowValues = Record<string, unknown>;
export type DrawingView = "interna" | "esterna";
export const WINDOW_COMPONENTS = [
  ["primary", "Infisso"],
  ["cassonetto", "Cassonetto"],
  ["tapparella", "Tapparella"],
  ["zanzariera", "Zanzariera"],
  ["persiana", "Persiana"],
] as const;
export type WindowComponent = (typeof WINDOW_COMPONENTS)[number][0];
export type WindowPin = {
  id: string;
  x: number;
  y: number;
  text: string;
  view: DrawingView;
  component?: WindowComponent;
  photoId?: string;
};
export const WINDOW_PINS = "rv_annotations_v1";
export function windowDisplayValues(
  type: ElementTypeDefinition,
  values: WindowValues,
  header: WindowValues = {},
): WindowValues {
  if (type.key === "porta_interna")
    return {
      ...values,
      colore_interno: values.colore_interno || values.colore,
      colore_esterno: values.colore_esterno || values.colore,
    };
  const plural = {
    tapparella_standalone: "tapparelle",
    cassonetto_standalone: "cassonetti",
    zanzariera_standalone: "zanzariere",
    persiana_standalone: "persiane",
  }[type.key];
  return {
    ...values,
    colore_interno:
      values.colore_interno ||
      values.colore ||
      (plural ? header[`colore_${plural}`] : header.colore_interno_infissi),
    colore_esterno:
      values.colore_esterno ||
      values.colore ||
      (plural ? header[`colore_${plural}`] : header.colore_esterno_infissi),
    ...Object.fromEntries(
      [
        ["tap", "tapparelle"],
        ["cas", "cassonetti"],
        ["zan", "zanzariere"],
        ["per", "persiane"],
      ].map(([prefix, key]) => [
        `${prefix}_colore`,
        values[`${prefix}_colore`] || header[`colore_${key}`],
      ]),
    ),
  };
}
export function windowOrderVerified(values: WindowValues) {
  return (
    values.rv_order_checked === true &&
    [values.rv_order_width, values.rv_order_height].every(
      (v) =>
        typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100000,
    ) &&
    typeof values.rv_order_reference === "string" &&
    !!values.rv_order_reference.trim()
  );
}
export function portoncinoOpeningComplete(values: WindowValues) {
  return (
    ["sx", "dx"].includes(String(values.rv_door_hinge)) &&
    ["spingere", "tirare"].includes(String(values.rv_door_swing))
  );
}
export function windowSurveyDraftValues(
  previous: WindowValues,
  next: WindowValues,
  type?: ElementTypeDefinition,
): WindowValues {
  if (
    type &&
    ["infisso", "zanzariera_standalone"].includes(type.key) &&
    ["rv_zan_direction", "rv_zan_mechanism", "rv_zan_panels"].some(
      (k) => next[k] !== previous[k],
    ) &&
    ["verticale", "orizzontale", "battente", "fissa"].includes(
      String(next.rv_zan_direction),
    )
  )
    next = {
      ...next,
      [type.key === "infisso" ? "zan_tipo" : "tipo"]: mosquitoKind(next),
    };
  if (
    type?.key === "portoncino_blindato" &&
    next.rv_door_layout !== previous.rv_door_layout &&
    ["singola", "doppia_simmetrica", "doppia_asimmetrica"].includes(
      String(next.rv_door_layout),
    )
  )
    next = {
      ...next,
      tipologia: next.rv_door_layout === "singola" ? "1_anta" : "2_ante",
    };
  if (previous.rv_order_checked !== true || next.rv_order_checked !== true)
    return next;
  const changed = [
    ...new Set([...Object.keys(previous), ...Object.keys(next)]),
  ].some(
    (k) =>
      /larghezza|altezza|profondita|spessore_muro|mazzetta|cilindro|tipologia|apertura|tipo_telaio|lati_con_z|colore|vetro|materiale|^rv_(?:monoblock_|project_|abaco_|door_|zan_|tap_|guide_|roller_|leaf_|cielino_|inspection|total_leaves|order_(?:width|height|reference)|measure_basis)/.test(
        k,
      ) && JSON.stringify(previous[k]) !== JSON.stringify(next[k]),
  );
  return changed ? { ...next, rv_order_checked: false } : next;
}
const TYPES = new Set([
  "infisso",
  "portoncino_blindato",
  "porta_interna",
  "tapparella_standalone",
  "persiana_standalone",
  "zanzariera_standalone",
  "cassonetto_standalone",
]);
export const isWindowSurvey = (type: ElementTypeDefinition | undefined) =>
  !!type && TYPES.has(type.key);
const options = (pairs: Array<[string, string]>) =>
  pairs.map(([value, label]) => ({ value, label }));
const num = (
  key: string,
  label: string,
  unit: "mm" | "ml" = "mm",
): FieldDefinition => ({
  key,
  label,
  type: "dimension",
  unit,
  min: 0,
  max: unit === "mm" ? 100000 : 10000,
  step: 0.1,
  width: 6,
});
const text = (key: string, label: string): FieldDefinition => ({
  key,
  label,
  type: "text",
  width: 12,
});
const select = (
  key: string,
  label: string,
  pairs: Array<[string, string]>,
): FieldDefinition => ({
  key,
  label,
  type: "select",
  options: options(pairs),
  width: 6,
});
export const LEAF_TYPES: Array<[TipoAnta, string]> = [
  ["battente", "Battente"],
  ["anta_ribalta", "Anta-ribalta"],
  ["vasistas", "Vasistas"],
  ["fisso", "Fisso"],
  ["scorrevole", "Scorrevole"],
  ["alzante_scorrevole", "Alzante scorrevole"],
  ["libro", "A libro"],
];
const SIZES: Array<[string, string]> = [
  ["foro", "Misura del foro"],
  ["esistente", "Misura dell’esistente"],
  ["finita", "Misura finita"],
  ["da_definire", "Da definire"],
];
export function windowSurveySections(
  type: ElementTypeDefinition,
): FieldSection[] {
  if (!isWindowSurvey(type)) return type.sections;
  const infisso = type.key === "infisso" || isSurveyDoor(type);
  const attached = (name: string) =>
    type.key === `${name}_standalone` || type.key === "infisso";
  const extra: FieldSection[] = [
    {
      key: "rv_misure",
      label: "Riferimento delle misure e verifica d’ordine",
      fields: [
        select("rv_measure_basis", "Le misure rilevate sono", SIZES),
        num("rv_order_width", "Larghezza finita per ordine"),
        num("rv_order_height", "Altezza finita per ordine"),
        text(
          "rv_order_reference",
          "Riferimento verifica (tecnico / documento)",
        ),
        {
          key: "rv_order_checked",
          label: "Misure finite verificate per questo elemento",
          type: "boolean",
          width: 12,
          help: "Non crea un ordine né aggiorna il preventivo. Nessuna tolleranza viene calcolata automaticamente.",
        },
      ],
    },
  ];
  if (type.key === "infisso") extra.push(...windowAbacoSections());
  if (type.key === "infisso") extra.push(...monoblockSections());
  if (infisso)
    extra.push({
      key: "rv_finiture",
      label: "Finiture di questo elemento",
      fields: [
        {
          ...text(
            "colore_interno",
            type.key === "porta_interna"
              ? "Colore lato B"
              : "Colore interno · eccezione al colore generale",
          ),
          help:
            type.key === "porta_interna"
              ? "RAL, nome o HEX. Vuoto: bianco solo nel disegno, colore da confermare. Non eredita il colore degli infissi."
              : "Vuoto: usa il colore generale del rilievo. RAL, nome o HEX.",
        },
        {
          ...text(
            "colore_esterno",
            type.key === "porta_interna"
              ? "Colore lato A"
              : "Colore esterno · eccezione al colore generale",
          ),
          help:
            type.key === "porta_interna"
              ? "RAL, nome o HEX. Vuoto: bianco solo nel disegno, colore da confermare. Non eredita il colore degli infissi."
              : "Vuoto: usa il colore generale del rilievo. La resa a video è indicativa.",
        },
      ],
    });
  else
    extra.push({
      key: "rv_finiture",
      label: "Finitura di questo elemento",
      fields: [
        {
          ...text("colore", "Colore · eccezione al colore generale"),
          help: "Vuoto: usa il colore generale del rilievo. RAL, nome o HEX.",
        },
      ],
    });
  if (infisso)
    extra.push({
      key: "rv_posa",
      label: "Posa e coprifili",
      fields: [
        num("rv_diagonal_1", "Diagonale 1"),
        num("rv_diagonal_2", "Diagonale 2"),
        num("rv_sill_depth", "Profondità davanzale / soglia"),
        text("rv_installation", "Sistema di posa e vincoli"),
        ...["sx", "dx", "alto", "basso"].flatMap((side) => [
          num(
            `rv_trim_${side}_length`,
            `Coprifilo ${side} · lunghezza effettiva`,
          ),
          num(`rv_trim_${side}_width`, `Coprifilo ${side} · larghezza`),
        ]),
        text("rv_trim_finish", "Coprifili · finitura / tagli / giunti"),
      ],
    });
  if (attached("cassonetto"))
    extra.push({
      key: "rv_cassonetto",
      label: "Cassonetto · ispezione e cielino",
      ...(type.key === "infisso"
        ? {
            show_if: {
              field: "complementi",
              operator: "contains" as const,
              value: "cassonetto",
            },
          }
        : {}),
      fields: [
        ...(type.key === "infisso"
          ? [select("rv_cas_basis", "Misure cassonetto", SIZES)]
          : []),
        ...(type.key === "infisso"
          ? [
              text(
                "cas_colore",
                "Colore cassonetto · eccezione al colore generale",
              ),
            ]
          : []),
        num("rv_cielino_width", "Larghezza cielino"),
        num("rv_cielino_depth", "C · profondità totale cielino"),
        num("rv_cielino_thickness", "Spessore cielino"),
        select("rv_inspection", "Ispezione", [
          ["frontale", "Frontale"],
          ["inferiore", "Inferiore"],
          ["esterna", "Esterna"],
          ["altro", "Altro / da verificare"],
        ]),
        text("rv_cas_obstacles", "Ostacoli, fissaggi e coibentazione"),
      ],
    });
  if (attached("tapparella"))
    extra.push({
      key: "rv_tapparella",
      label: "Tapparella · guide, rullo e comando",
      ...(type.key === "infisso"
        ? {
            show_if: {
              field: "complementi",
              operator: "contains" as const,
              value: "tapparella",
            },
          }
        : {}),
      fields: [
        ...(type.key === "infisso"
          ? [select("rv_tap_basis", "Misure tapparella", SIZES)]
          : []),
        ...(type.key === "infisso"
          ? [
              text(
                "tap_colore",
                "Colore tapparella · eccezione al colore generale",
              ),
            ]
          : []),
        num("rv_guide_sx", "Guida SX · lunghezza"),
        num("rv_guide_dx", "Guida DX · lunghezza"),
        num("rv_guide_depth", "Profondità utile guida"),
        text("rv_guide_profile", "Sezione / tipo guide"),
        ...projectingGuideFields(),
        ...installationFields("tapparella"),
        text(
          "rv_tap_model",
          "Modello telo / guide e riferimento scheda tecnica",
        ),
        num("rv_roller_length", "Lunghezza rullo"),
        num("rv_roller_diameter", "Diametro / sezione rullo"),
        text("rv_caps", "Calotte, supporti e cuscinetti"),
        text("rv_motor", "Motore · marca, modello, coppia da verificare"),
        select("rv_motor_side", "Lato comando (vista interna)", [
          ["sx", "Sinistra"],
          ["dx", "Destra"],
          ["da_definire", "Da definire"],
        ]),
        text("rv_power", "Alimentazione, cavi e punto elettrico"),
        text("rv_tap_accessories", "Accessori e quantità da ordinare"),
      ],
    });
  if (attached("zanzariera"))
    extra.push({
      key: "rv_zanzariera",
      label: "Zanzariera · ingombri di montaggio",
      ...(type.key === "infisso"
        ? {
            show_if: {
              field: "complementi",
              operator: "contains" as const,
              value: "zanzariera",
            },
          }
        : {}),
      fields: [
        ...(type.key === "infisso"
          ? [select("rv_zan_basis", "Misure zanzariera", SIZES)]
          : []),
        ...(type.key === "infisso"
          ? [
              text(
                "zan_colore",
                "Colore zanzariera · eccezione al colore generale",
              ),
            ]
          : []),
        num("rv_zan_space", "Spazio utile per installazione"),
        select("rv_zan_direction", "Direzione di apertura della rete", [
          ["verticale", "Verticale"],
          ["orizzontale", "Orizzontale / laterale"],
          ["battente", "A battente"],
          ["fissa", "Fissa"],
        ]),
        select("rv_zan_mechanism", "Sistema di movimento / comando", [
          ["molla", "Avvolgibile a molla"],
          ["frizionata", "Molla con freno / frizionata"],
          ["catena", "Comando a catenella"],
          ["motore", "Motorizzata"],
          ["plisse", "Rete plissettata"],
          ["manuale", "Manuale a battente"],
          ["fissa", "Telaio fisso"],
        ]),
        select("rv_zan_panels", "Suddivisione della zanzariera", [
          ["singola", "Un campo"],
          ["doppia", "Due campi con incontro centrale"],
        ]),
        select("rv_zan_guide_system", "Sistema di guida inferiore", [
          ["standard", "Guida tradizionale"],
          ["carrarmato", "Cingolo / carrarmato"],
          ["senza_barriera", "Senza guida a pavimento"],
          ["da_verificare", "Da verificare"],
        ]),
        num("rv_zan_guide_height", "Altezza effettiva guida / soglia"),
        num("rv_zan_cassette_size", "Ingombro cassonetto / raccolta"),
        ...installationFields("zanzariera"),
        text("rv_zan_model", "Produttore, modello, rete e finitura profili"),
        text("rv_zan_controls", "Comando, freno, chiusura, motore e accessori"),
        select("rv_zan_bottom_rail", "Guida a pavimento", [
          ["si", "Presente"],
          ["no", "Assente (senza barriera)"],
          ["da_definire", "Da verificare"],
        ]),
        select("rv_zan_side", "Lato raccolta (vista interna)", [
          ["sx", "Sinistra"],
          ["dx", "Destra"],
          ["alto", "In alto"],
          ["nessuno", "Fissa / nessuna raccolta"],
        ]),
        text("rv_zan_guides", "Guide, soglia, rete e ostacoli"),
      ],
    });
  if (type.key === "infisso")
    extra.push({
      key: "rv_persiana",
      label: "Persiana · finitura",
      show_if: {
        field: "complementi",
        operator: "contains",
        value: "persiana",
      },
      fields: [
        text("per_colore", "Colore persiana · eccezione al colore generale"),
      ],
    });
  // A company can already define some of these keys. Its definitions win; never duplicate them.
  if (isSurveyDoor(type)) extra.push(...doorSurveySections(type));
  const used = new Set(
    type.sections
      .flatMap((s) => flattenWindowFields(s.fields))
      .map((f) => f.key),
  );
  const sections = type.sections.map((s) => ({ ...s, fields: [...s.fields] }));
  const hasWallMeasurement = type.sections
    .flatMap((s) => flattenWindowFields(s.fields))
    .some(
      (f) =>
        f.key === "spessore_muro" && ["mm", "cm", "m"].includes(f.unit ?? ""),
    );
  for (const section of extra) {
    const fields = section.fields.filter(
      (f) =>
        !used.has(f.key) &&
        !(hasWallMeasurement && f.key === "rv_abaco_wall_depth"),
    );
    fields.forEach((f) => used.add(f.key));
    if (!fields.length) continue;
    const existing = sections.find((s) => s.key === section.key);
    if (existing) existing.fields.push(...fields);
    else sections.push({ ...section, fields });
  }
  return sections;
}
export function flattenWindowFields(
  fields: FieldDefinition[],
): FieldDefinition[] {
  return fields.flatMap((f) => [
    f,
    ...flattenWindowFields(f.nested_fields ?? []),
  ]);
}
export function dimensionMm(
  type: ElementTypeDefinition,
  values: WindowValues,
  key: string,
) {
  const field = type.sections
    .flatMap((s) => flattenWindowFields(s.fields))
    .find((f) => f.key === key);
  const v = values[key];
  const factor =
    field?.unit === "mm"
      ? 1
      : field?.unit === "cm"
        ? 10
        : field?.unit === "m"
          ? 1000
          : null;
  return typeof v === "number" && Number.isFinite(v) && v > 0 && factor
    ? v * factor
    : null;
}
export const windowMeasureKeys = (type: ElementTypeDefinition) =>
  type.key === "infisso" &&
  type.sections.some((s) => s.fields.some((f) => f.key === "larghezza_foro"))
    ? ["larghezza_foro", "altezza_foro"]
    : ["larghezza", "altezza"];
const str = (v: unknown) => (typeof v === "string" ? v : "");
export function mosquitoKind(values: WindowValues) {
  const direction = str(values.rv_zan_direction),
    mechanism = str(values.rv_zan_mechanism);
  if (direction === "fissa") return "fissa";
  if (direction === "battente")
    return values.rv_zan_panels === "doppia" ? "doppia_anta" : "battente";
  if (direction === "verticale") return "avvolgibile_verticale";
  if (direction === "orizzontale")
    return mechanism === "plisse" ? "plissettata" : "avvolgibile_laterale";
  return str(values.tipo);
}
export function leafCount(values: WindowValues): number {
  if (
    Number.isInteger(values.rv_total_leaves) &&
    Number(values.rv_total_leaves) >= 1 &&
    Number(values.rv_total_leaves) <= 6
  )
    return Number(values.rv_total_leaves);
  const match = /(?:^|_)([1-6])_?ant/.exec(str(values.tipologia));
  return match
    ? Number(match[1])
    : ["fisso", "finestra_vasistas", "tonda_ovale"].includes(
          str(values.tipologia),
        )
      ? 1
      : 0;
}
export function windowLeafSummary(
  values: WindowValues,
  typeKey?: string,
): string | null {
  if (
    typeKey === "porta_interna" &&
    [
      "scorrevole_esterno",
      "scorrevole_scomparsa",
      "a_libro",
      "a_soffietto",
    ].includes(str(values.tipologia))
  ) {
    const name =
      values.tipologia === "scorrevole_esterno"
        ? "Scorrevole esterno muro"
        : values.tipologia === "scorrevole_scomparsa"
          ? "Scorrevole a scomparsa"
          : values.tipologia === "a_libro"
            ? "A libro"
            : "A soffietto";
    const collection =
      String(values.rv_door_layout).startsWith("doppia") &&
      String(values.tipologia).startsWith("scorrevole")
        ? "ante contrapposte"
        : values.rv_door_slide_side === "sx"
          ? "raccolta SX"
          : values.rv_door_slide_side === "dx"
            ? "raccolta DX"
            : "raccolta da confermare";
    return `${name} · ${collection} · riferimento lato A`;
  }
  if (values.rv_door_hinge || values.rv_door_swing)
    return `${values.rv_door_swing === "spingere" ? "A spingere" : values.rv_door_swing === "tirare" ? "A tirare" : "Verso da confermare"} · cerniere ${values.rv_door_hinge === "sx" ? "SX" : values.rv_door_hinge === "dx" ? "DX" : "da confermare"} viste ${typeKey === "porta_interna" ? "dal lato A" : "dall’esterno"}`;
  const count = leafCount(values);
  if (
    !count ||
    !Array.from(
      { length: count },
      (_, i) => values[`rv_leaf_${i}_type`] || values[`rv_leaf_${i}_side`],
    ).some(Boolean)
  )
    return null;
  return Array.from({ length: count }, (_, i) => {
    const type =
      LEAF_TYPES.find(([k]) => k === values[`rv_leaf_${i}_type`])?.[1] ??
      "apertura da confermare";
    const side = values[`rv_leaf_${i}_side`];
    return `${i + 1}: ${type}${side === "sx" || side === "dx" ? ` · ${side.toUpperCase()} da dentro` : ""}`;
  }).join(" / ");
}
export function readWindowPins(values: WindowValues): WindowPin[] {
  if (!Array.isArray(values[WINDOW_PINS])) return [];
  return (values[WINDOW_PINS] as unknown[]).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const p = raw as Record<string, unknown>;
    return typeof p.id === "string" &&
      typeof p.text === "string" &&
      p.text.trim() &&
      p.text.length <= 2000 &&
      typeof p.x === "number" &&
      typeof p.y === "number" &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      p.x >= 0 &&
      p.x <= 1 &&
      p.y >= 0 &&
      p.y <= 1 &&
      ["interna", "esterna"].includes(str(p.view)) &&
      (p.component == null ||
        WINDOW_COMPONENTS.some(([k]) => k === p.component))
      ? [
          {
            id: p.id,
            text: p.text,
            x: p.x,
            y: p.y,
            view: p.view as DrawingView,
            ...(p.component
              ? { component: p.component as WindowComponent }
              : {}),
            ...(typeof p.photoId === "string" ? { photoId: p.photoId } : {}),
          },
        ]
      : [];
  });
}
export function trimMetres(values: WindowValues, quantity = 1) {
  const lengths = ["sx", "dx", "alto", "basso"].map(
    (s) => values[`rv_trim_${s}_length`],
  );
  const filled = lengths.filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0,
  );
  return {
    entered: filled.length,
    perElement: filled.reduce((a, b) => a + b, 0) / 1000,
    total: (filled.reduce((a, b) => a + b, 0) / 1000) * quantity,
  };
}
export function windowSurveyIssues(
  type: ElementTypeDefinition,
  values: WindowValues,
): string[] {
  if (!isWindowSurvey(type)) return [];
  const issues: string[] = [];
  issues.push(...(windowSystem(type.key, values)?.checks ?? []));
  issues.push(
    ...((
      windowSurveyDrawing(type, values)?.installation ??
      installationEnvelope(type.key, values)
    )?.warnings ?? []),
  );
  if (type.key === "infisso" && Array.isArray(values.complementi))
    for (const component of ["tapparella", "zanzariera"] as const)
      if (values.complementi.includes(component)) {
        const projected = windowComponentData(type, values, component);
        issues.push(
          ...(windowSystem(projected.type.key, projected.values)?.checks ?? []),
          ...((
            windowSurveyDrawing(projected.type, projected.values)
              ?.installation ??
            installationEnvelope(projected.type.key, projected.values)
          )?.warnings ?? []),
        );
      }
  if (type.key === "infisso")
    issues.push(...(windowSurveyDrawing(type, values)?.abaco?.checks ?? []));
  if (isSurveyDoor(type)) {
    const [wk, hk] = windowMeasureKeys(type),
      w = dimensionMm(type, values, wk),
      h = dimensionMm(type, values, hk);
    if (w && h)
      issues.push(
        ...doorSurveyScene(
          w,
          h,
          values,
          true,
          type.key === "porta_interna",
        ).warnings.filter((w) => !w.includes("pannello illustrativo")),
      );
  }
  if (values.rv_order_checked === true && !windowOrderVerified(values))
    issues.push(
      "Per verificare l’ordine servono entrambe le misure finite e il riferimento della verifica.",
    );
  if (values.rv_order_checked !== true)
    issues.push(
      "Misure d’ordine non verificate: nessun ordine può essere dedotto dal disegno.",
    );
  const d1 = values.rv_diagonal_1,
    d2 = values.rv_diagonal_2;
  if (typeof d1 === "number" && typeof d2 === "number" && d1 !== d2)
    issues.push(
      `Diagonali diverse di ${Math.abs(d1 - d2).toLocaleString("it-IT")} mm: verificare il fuori squadra, senza correzioni automatiche.`,
    );
  const zanPrefix = type.key === "zanzariera_standalone" ? "" : "zan_";
  if (
    type.key === "zanzariera_standalone" ||
    (type.key === "infisso" &&
      Array.isArray(values.complementi) &&
      values.complementi.includes("zanzariera"))
  ) {
    const profile = dimensionMm(type, values, `${zanPrefix}larghezza_telaio`),
      width = dimensionMm(type, values, `${zanPrefix}larghezza`);
    if (profile && width && profile * 2 >= width)
      issues.push(
        "Il profilo della zanzariera occuperebbe tutto il vano: verifica valore e unità dello spessore, senza ridimensionamenti automatici.",
      );
    if (
      (values.rv_zan_direction === "verticale" &&
        values.rv_zan_mechanism === "plisse") ||
      (["fissa", "battente"].includes(str(values.rv_zan_direction)) &&
        ["molla", "frizionata", "catena", "motore", "plisse"].includes(
          str(values.rv_zan_mechanism),
        ))
    )
      issues.push(
        "Direzione e comando della zanzariera discordanti: verifica il modello prima di confermare il disegno.",
      );
    if (
      values.rv_zan_guide_system === "carrarmato" &&
      (values.rv_zan_bottom_rail === "no" ||
        values.rv_zan_direction === "verticale")
    )
      issues.push(
        "Guida carrarmato: verifica la compatibilità con direzione e guida inferiore; nessuna compatibilità viene certificata dal disegno.",
      );
  }
  if (!hasFullZ(values) && /^z/i.test(str(values.tipo_telaio)))
    issues.push(
      "Aletta Z parziale o lati da confermare: lo schema frontale non rappresenta il dettaglio di questa posa.",
    );
  return issues;
}
function hasFullZ(values: WindowValues) {
  return (
    Array.isArray(values.lati_con_z) &&
    ["sx", "dx", "alto", "basso"].every((side) =>
      (values.lati_con_z as unknown[]).includes(side),
    )
  );
}
export function validateWindowSurvey(
  type: ElementTypeDefinition,
  values: WindowValues,
) {
  if (!isWindowSurvey(type)) return;
  for (const key of windowMeasureKeys(type)) {
    const value = values[key];
    if (
      value != null &&
      value !== "" &&
      (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    )
      throw new Error("Larghezza e altezza devono essere misure positive.");
  }
  for (const [key, value] of Object.entries(values)) {
    if (
      WINDOW_SYSTEM_MEASURES.has(key) &&
      value != null &&
      value !== "" &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100000)
    )
      throw new Error(
        "Controlla guide a sporgere e monoblocco: quote in mm tra 0 e 100.000.",
      );
    if (
      ENVELOPE_MEASURE_KEYS.has(key) &&
      value != null &&
      value !== "" &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100000)
    )
      throw new Error(
        "Controlla spessori e ingombri: usa numeri tra 0 e 100.000 mm.",
      );
    if (
      /^rv_door_(?:fold_split_mm|free_left|free_right|track_length|clear_width)$/.test(
        key,
      ) &&
      value != null &&
      value !== "" &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 100000)
    )
      throw new Error(
        "Controlla le misure di scorrimento e ripiegamento: usa quote positive in mm, al massimo 100.000.",
      );
    if (/^rv_abaco_.*(?:width|height|depth)$/.test(key) && value === 0)
      throw new Error(
        "Controlla le misure tecniche dell’abaco: le quote inserite devono essere maggiori di zero.",
      );
    if (
      /^rv_(?:abaco_(?:(?:rough|counter|window)_(?:width|height)|wall_depth|frame_depth)|order_(?:width|height)|diagonal_[12]|sill_depth|trim_.*_(?:length|width)|cielino_.*|guide_(?:sx|dx|depth)|roller_(?:length|diameter)|zan_(?:space|guide_height|cassette_size)|door_(?:split_mm|toplight_height|frame_width|frame_height|frame_depth|sidelight_(?:left|right)_width))$/.test(
        key,
      ) &&
      value != null &&
      value !== "" &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100000)
    )
      throw new Error(
        "Controlla le misure tecniche: usa numeri tra 0 e 100.000 mm.",
      );
  }
  if (
    values.rv_door_fold_panels != null &&
    values.rv_door_fold_panels !== "" &&
    (!Number.isInteger(values.rv_door_fold_panels) ||
      Number(values.rv_door_fold_panels) < 2 ||
      Number(values.rv_door_fold_panels) > 20)
  )
    throw new Error(
      "Il numero di pannelli del soffietto deve essere intero, da 2 a 20.",
    );
  if (values.rv_order_checked === true && !windowOrderVerified(values))
    throw new Error(
      "Per verificare l’ordine servono entrambe le misure finite e il riferimento della verifica.",
    );
  for (const field of windowSurveySections(type).flatMap((s) => s.fields)) {
    const v = values[field.key];
    if (
      /^rv_(?:abaco_|door_|zan_)/.test(field.key) &&
      field.type === "select" &&
      v != null &&
      v !== "" &&
      !field.options?.some((o) => o.value === v)
    )
      throw new Error(`Controlla la scelta di «${field.label}».`);
  }
  if (
    values[WINDOW_PINS] != null &&
    (!Array.isArray(values[WINDOW_PINS]) ||
      readWindowPins(values).length !==
        (values[WINDOW_PINS] as unknown[]).length ||
      readWindowPins(values).length > 50)
  )
    throw new Error("Controlla le note sul disegno: massimo 50 punti validi.");
  if (
    values.rv_total_leaves != null &&
    (!Number.isInteger(values.rv_total_leaves) ||
      Number(values.rv_total_leaves) < 1 ||
      Number(values.rv_total_leaves) > 6)
  )
    throw new Error("Il numero totale di ante deve essere tra 1 e 6.");
  for (let i = 0; i < 6; i++) {
    if (
      values[`rv_leaf_${i}_type`] != null &&
      !LEAF_TYPES.some(([k]) => k === values[`rv_leaf_${i}_type`])
    )
      throw new Error("Tipo di apertura non riconosciuto.");
    if (
      values[`rv_leaf_${i}_side`] != null &&
      !["sx", "dx"].includes(String(values[`rv_leaf_${i}_side`]))
    )
      throw new Error("Lato dell’anta non riconosciuto.");
  }
}

/** Additional report fields stay human-readable; no JSON blobs or empty technical pages. */
export function windowSurveyReportSections(
  type: ElementTypeDefinition,
  values: WindowValues,
  quantity: number,
) {
  if (!isWindowSurvey(type)) return null;
  const originalKeys = new Set(
    type.sections
      .flatMap((s) => flattenWindowFields(s.fields))
      .map((f) => f.key),
  );
  const sections = windowSurveySections(type)
    .map((s) => ({
      ...s,
      fields: s.fields.filter((f) => !originalKeys.has(f.key)),
    }))
    .filter((s) => s.fields.length);
  if (type.key === "infisso")
    sections.push({
      key: "rv_aperture",
      label: "Schema ante · vista interna",
      fields: [
        { key: "rv_total_leaves", label: "Numero totale ante", type: "number" },
        ...Array.from({ length: leafCount(values) }, (_, i) => [
          select(`rv_leaf_${i}_type`, `Anta ${i + 1} · apertura`, LEAF_TYPES),
          select(
            `rv_leaf_${i}_side`,
            `Anta ${i + 1} · cerniere / scorrimento`,
            [
              ["sx", "Sinistra"],
              ["dx", "Destra"],
            ],
          ),
        ]).flat(),
      ],
    });
  const summary: Array<{
    key: string;
    label: string;
    value: string;
    missing: boolean;
    required: boolean;
  }> = [];
  const add = (key: string, label: string, value: string) =>
    summary.push({ key, label, value, missing: false, required: false });
  const trims = trimMetres(values, quantity);
  if (trims.entered)
    add(
      "rv_trim_total",
      "Coprifili · lunghezze inserite",
      `${trims.perElement.toLocaleString("it-IT")} ml / elemento; ${trims.total.toLocaleString("it-IT")} ml per ${quantity} elementi. ${trims.entered}/4 lati compilati. Senza sfrido.`,
    );
  readWindowPins(values).forEach((p, i) =>
    add(
      `rv_note_${i}`,
      `Nota ${i + 1} · ${p.component && p.component !== "primary" ? p.component : "elemento"} · ${type.key === "porta_interna" ? (p.view === "esterna" ? "lato A" : "lato B") : `vista ${p.view}`}`,
      `${p.text}${p.photoId ? " · foto collegata nel rilievo" : ""}`,
    ),
  );
  windowSurveyIssues(type, values).forEach((issue, i) =>
    add(`rv_check_${i}`, "Verifica tecnica", issue),
  );
  return { sections, summary };
}

/** Attached complements keep their own size, material and measurement basis. Never use the window's size. */
export function windowComponentData(
  type: ElementTypeDefinition,
  values: WindowValues,
  component: WindowComponent,
) {
  if (component === "primary" || type.key !== "infisso")
    return { type, values };
  const prefix = {
    cassonetto: "cas",
    tapparella: "tap",
    zanzariera: "zan",
    persiana: "per",
  }[component];
  const map: Record<string, string> = {
    larghezza: `${prefix}_larghezza`,
    altezza: `${prefix}_altezza`,
    colore: `${prefix}_colore`,
    materiale: `${prefix}_materiale`,
    n_ante: `${prefix}_n_ante`,
    aletta: `${prefix}_aletta`,
    profondita: `${prefix}_profondita`,
    cilindro: `${prefix}_cilindro`,
    larghezza_telaio: `${prefix}_larghezza_telaio`,
    tipo: component === "tapparella" ? "tap_tipo_motore" : `${prefix}_tipo`,
  };
  const fields = type.sections.flatMap((s) => flattenWindowFields(s.fields));
  const projected: WindowValues = {
    ...Object.fromEntries(
      Object.entries(values).filter(([k]) => k.startsWith("rv_")),
    ),
    rv_measure_basis: values[`rv_${prefix}_basis`],
  };
  const definitions = Object.entries(map).flatMap(([to, from]) => {
    projected[to] = values[from];
    const f = fields.find((f) => f.key === from);
    return f ? [{ ...f, key: to }] : [];
  });
  return {
    type: {
      ...type,
      key: `${component}_standalone`,
      sections: [{ key: "specifiche", label: component, fields: definitions }],
    },
    values: projected,
  };
}

export type WindowDrawing = {
  scene: ScenaSerramento;
  drawing?: SerramentoDisegno;
  warnings: string[];
  basis: string;
  internal: ReturnType<typeof finituraDaEtichetta>;
  external: ReturnType<typeof finituraDaEtichetta>;
  detail?: {
    scene: ScenaSerramento;
    title: string;
    caption: string;
    labels?: { top: string; bottom: string };
  };
  axonometric?: BoxAxonometric;
  abaco?: WindowAbaco;
  installation?: InstallationEnvelope;
  system?: WindowSystem;
};
export function windowSurveyDrawing(
  type: ElementTypeDefinition,
  values: WindowValues,
  view: DrawingView = "interna",
  order = false,
): WindowDrawing | null {
  if (!isWindowSurvey(type)) return null;
  const [wk, hk] = windowMeasureKeys(type);
  const width = order
    ? (values.rv_order_width as number)
    : dimensionMm(type, values, wk);
  const height = order
    ? (values.rv_order_height as number)
    : dimensionMm(type, values, hk);
  if (order && !windowOrderVerified(values)) return null;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 100000 ||
    height > 100000
  )
    return null;
  const warnings: string[] = [];
  const internalLabel = surveyColor(values, "interna"),
    externalLabel = surveyColor(values, "esterna");
  const internal = finish(internalLabel),
    external = finish(externalLabel);
  if ((internalLabel && !internal) || (externalLabel && !external))
    warnings.push(
      "Colore non riconosciuto: rappresentazione neutra; fa fede il codice scritto.",
    );
  const basis = order
    ? "Misure finite verificate · non è un ordine"
    : (SIZES.find(([k]) => k === values.rv_measure_basis)?.[1] ??
      (wk.includes("foro")
        ? "Misura del foro · non d’ordine"
        : "Riferimento misura da definire"));
  const installation = installationEnvelope(type.key, values, {
    width,
    height,
  });
  const base = {
    warnings,
    basis,
    internal,
    external,
    ...(installation ? { installation } : {}),
    ...(!order && windowSystem(type.key, values)
      ? { system: windowSystem(type.key, values)! }
      : {}),
  };
  if (isSurveyDoor(type)) {
    const d = doorSurveyScene(
      width,
      height,
      values,
      view === "esterna",
      type.key === "porta_interna",
    );
    return {
      ...base,
      scene: d.scene,
      warnings: [...warnings, ...d.warnings],
      ...(d.plan
        ? {
            detail: {
              scene: d.plan,
              title: d.planTitle ?? "Verso di apertura · vista dall’alto",
              ...(d.planLabels ? { labels: d.planLabels } : {}),
              caption:
                d.planCaption ??
                (type.key === "porta_interna"
                  ? `LATO A in alto · LATO B in basso. ${str(values.rv_door_side_a) || "Lato A da identificare"} / ${str(values.rv_door_side_b) || "Lato B da identificare"}. ${values.rv_door_swing === "spingere" ? "A spingere verso B" : "A tirare verso A"}. Arco illustrativo, non certifica la luce netta.`
                  : `ESTERNO in alto · INTERNO in basso. Cerniere ${values.rv_door_hinge === "sx" ? "a sinistra" : "a destra"} viste da fuori; ${values.rv_door_swing === "spingere" ? "a spingere verso l’interno" : "a tirare verso l’esterno"}. Arco illustrativo, non certifica la luce netta.`),
            },
          }
        : {}),
    };
  }
  if (type.key === "infisso") {
    const unsupported = [
      "bow_window",
      "lucernario",
      "finestra_basculante",
    ].includes(str(values.tipologia));
    const count = leafCount(values);
    const ante: AntaDisegno[] = Array.from({ length: count }, (_, i) => {
      const explicit = str(values[`rv_leaf_${i}_type`]);
      const opening = LEAF_TYPES.some(([k]) => k === explicit)
        ? explicit
        : str(values.apertura);
      const kind = LEAF_TYPES.some(([k]) => k === opening)
        ? (opening as TipoAnta)
        : str(values.tipologia) === "fisso" ||
            str(values.tipologia) === "tonda_ovale"
          ? "fisso"
          : str(values.tipologia) === "finestra_vasistas"
            ? "vasistas"
            : undefined;
      const side = values[`rv_leaf_${i}_side`];
      if (
        !kind ||
        (kind !== "fisso" &&
          kind !== "vasistas" &&
          side !== "sx" &&
          side !== "dx")
      )
        warnings.push(
          `Anta ${i + 1}: apertura o lato da confermare; campo neutro senza simbolo.`,
        );
      return {
        tipo:
          kind &&
          (kind === "fisso" ||
            kind === "vasistas" ||
            side === "sx" ||
            side === "dx")
            ? kind
            : "fisso",
        ...(side === "sx" || side === "dx" ? { lato: side } : {}),
      };
    });
    if (!count || unsupported) {
      warnings.push(
        unsupported
          ? "Tipologia speciale: schema d’ingombro, dettaglio esecutivo da allegare."
          : "Numero totale di ante da definire: solo ingombro quotato.",
      );
      return { ...base, scene: outline(width, height) };
    }
    const frame = str(values.tipo_telaio);
    const z = /^z_(30|35|60|65)$/.exec(frame);
    const partialZ = !hasFullZ(values);
    const drawing: SerramentoDisegno = {
      larghezzaMm: width,
      altezzaMm: height,
      ante,
      vista: view,
      ...(str(values.tipologia) === "tonda_ovale"
        ? { forma: "tonda" as const }
        : {}),
      ...(frame === "l"
        ? { telaio: { tipo: "L" as const } }
        : z && !partialZ
          ? { telaio: { tipo: "Z" as const, alettaMm: Number(z[1]) } }
          : {}),
      vetro: vetroDaEtichette(str(values.vetro)),
    };
    const scene = disegnaSerramento(drawing);
    return {
      ...base,
      drawing,
      scene,
      ...(!order
        ? {
            abaco: windowAbaco(
              {
                ...values,
                rv_abaco_wall_depth:
                  values.rv_abaco_wall_depth ??
                  dimensionMm(type, values, "spessore_muro"),
              },
              ante,
              {
                width,
                height,
                isRough:
                  values.rv_measure_basis === "foro" ||
                  (!values.rv_measure_basis && wk.includes("foro")),
              },
            ),
          }
        : {}),
    };
  }
  if (type.key === "zanzariera_standalone")
    return {
      ...base,
      scene: mosquitoScene(
        width,
        height,
        mosquitoKind(values),
        dimensionMm(type, values, "larghezza_telaio"),
        str(values.rv_zan_side),
        values.rv_zan_guide_system === "senza_barriera"
          ? "no"
          : values.rv_zan_bottom_rail,
        view === "esterna",
        {
          mechanism: str(values.rv_zan_mechanism),
          panels: str(values.rv_zan_panels),
          guide: str(values.rv_zan_guide_system),
          guideWidth: positiveMm(values.rv_zan_guide_width),
          guideHeight: positiveMm(values.rv_zan_guide_height),
          collectionWidth: positiveMm(values.rv_zan_pack_width),
        },
      ),
      warnings: [
        ...warnings,
        "Rete e profili rappresentano la tipologia rilevata; spessori non misurati restano illustrativi, non sono misure d’ordine.",
        ...(["avvolgibile_laterale", "plissettata"].includes(
          mosquitoKind(values),
        ) &&
        values.rv_zan_panels !== "doppia" &&
        !["sx", "dx"].includes(str(values.rv_zan_side))
          ? [
              "Lato di raccolta da confermare prima di rappresentare lo scorrimento.",
            ]
          : []),
      ],
    };
  if (type.key === "cassonetto_standalone") {
    const box = boxScenes(
      width,
      height,
      dimensionMm(type, values, "profondita"),
      str(values.rv_inspection),
      dimensionMm(type, values, "cilindro"),
      typeof values.rv_cielino_depth === "number" &&
        Number.isFinite(values.rv_cielino_depth) &&
        values.rv_cielino_depth > 0
        ? values.rv_cielino_depth
        : null,
      typeof values.rv_cielino_thickness === "number" &&
        Number.isFinite(values.rv_cielino_thickness) &&
        values.rv_cielino_thickness > 0
        ? values.rv_cielino_thickness
        : null,
    );
    return {
      ...base,
      scene: box.front,
      axonometric:
        boxAxonometric(
          width,
          height,
          dimensionMm(type, values, "profondita"),
          typeof values.rv_cielino_depth === "number"
            ? values.rv_cielino_depth
            : null,
          typeof values.rv_cielino_width === "number"
            ? values.rv_cielino_width
            : null,
          str(values.rv_inspection),
        ) ?? undefined,
      ...(box.section
        ? {
            detail: {
              scene: box.section,
              title: "Sezione laterale · altezza e profondità",
              caption:
                "Cielino e diametro quotati solo se rilevati. Posizione di rullo e pannelli schematica; profili esecutivi secondo il produttore.",
            },
          }
        : {}),
      warnings: [
        ...warnings,
        ...(!dimensionMm(type, values, "profondita")
          ? ["Per la vista 3D, rileva anche P · profondità del cassonetto."]
          : []),
        ...(!values.rv_inspection
          ? ["Lato d’ispezione da rilevare: non viene scelto automaticamente."]
          : []),
      ],
    };
  }
  if (
    type.key === "persiana_standalone" ||
    type.key === "tapparella_standalone"
  ) {
    const shutter = type.key === "tapparella_standalone";
    if (shutter) {
      const scene = outline(width, height);
      // The quotation avvolgibile scene includes an estimated box. A measured curtain must not inherit that box.
      const pitch = positiveMm(values.rv_tap_slat_height);
      const count = pitch ? Math.ceil(height / pitch) : 20;
      for (let i = 1; i < count; i += Math.max(1, Math.ceil(count / 200)))
        scene.forme.push({
          kind: "poly",
          ruolo: "lamellaLinea",
          punti: [
            [0, pitch ? pitch * i : (height * i) / 20],
            [width, pitch ? pitch * i : (height * i) / 20],
          ],
        });
      return {
        ...base,
        scene,
        warnings: [
          ...warnings,
          pitch
            ? "Passo delle stecche rilevato; profilo illustrativo. Le guide sono quotate separatamente, senza allargare il telo."
            : "Ingombro del telo, stecche illustrative: cassonetto, guide e rullo non vengono aggiunti alle misure.",
          ...(count > 200
            ? [
                "Tratteggio delle stecche campionato per leggibilità; il passo registrato non viene modificato.",
              ]
            : []),
        ],
      };
    }
    const count =
      typeof values.n_ante === "number" &&
      Number.isInteger(values.n_ante) &&
      values.n_ante >= 1 &&
      values.n_ante <= 4
        ? values.n_ante
        : null;
    if (
      !shutter &&
      (!count || !["battente", "scorrevole"].includes(str(values.tipo)))
    )
      return {
        ...base,
        scene: outline(width, height),
        warnings: [
          ...warnings,
          "Tipo / ante della persiana da definire: solo ingombro quotato.",
        ],
      };
    return {
      ...base,
      scene: disegnaPersiana({
        larghezzaMm: width,
        altezzaMm: height,
        ante: count ?? 1,
        tipo: shutter
          ? "avvolgibile"
          : values.tipo === "scorrevole"
            ? "scorrevole"
            : "veneziana",
        vista: view,
        ...([35, 60].includes(Number(values.aletta))
          ? { alettaMm: Number(values.aletta) }
          : {}),
      }),
      warnings: [
        ...warnings,
        "Cerniere e lamelle illustrative: verificare verso di apertura e ferramenta della persiana.",
      ],
    };
  }
  return {
    ...base,
    scene: outline(width, height),
    warnings: [
      ...warnings,
      type.key === "cassonetto_standalone"
        ? "Ingombro frontale: profondità e cielino sono riportati nelle misure."
        : "Ingombro frontale: rete, raccolta e profili sono descritti nei dati.",
    ],
  };
}
/** Render-only default: never persisted as a confirmed finish or supplier RAL. */
const SURVEY_WHITE = {
  tipo: "tinta" as const,
  hex: "#ffffff",
  nome: "Bianco di rappresentazione",
};
function positiveMm(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100000
    ? value
    : null;
}
function surveyColor(values: WindowValues, view: DrawingView): string {
  return (
    str(
      values[view === "interna" ? "colore_interno" : "colore_esterno"],
    ).trim() || str(values.colore).trim()
  );
}
export function windowSurveyFinishLabel(
  values: WindowValues,
  view: DrawingView,
): string {
  const label = surveyColor(values, view);
  return !label
    ? "Bianco di rappresentazione · colore da confermare"
    : `Finitura: ${label} · ${finish(label) ? "resa indicativa" : "resa neutra"}`;
}
function finish(value: string) {
  if (!value.trim()) return SURVEY_WHITE;
  return /^#[0-9a-f]{6}$/i.test(value)
    ? { tipo: "tinta" as const, hex: value, nome: value }
    : finituraDaEtichetta(value);
}
function outline(w: number, h: number): ScenaSerramento {
  return {
    larghezza: w,
    altezza: h,
    sporgenza: 0,
    forme: [{ kind: "rect", ruolo: "pannello", x: 0, y: 0, w, h }],
    quote: [
      { orientamento: "h", lato: "sotto", da: 0, a: w, testo: `${w} mm` },
      { orientamento: "v", lato: "sx", da: 0, a: h, testo: `${h} mm` },
    ],
  };
}
