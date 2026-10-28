/** Measured envelopes, not manufacturer profile sections or an automatic fit certificate. */
import type { FieldDefinition } from "@/types/surveys";
import type { ScenaSerramento } from "@/lib/serramenti/disegnoSerramento";
import { measuredScene } from "./windowComponentScenes";
type Values = Record<string, unknown>;
type Family = "door" | "tapparella" | "zanzariera";
const fields: Record<Family, Array<[string, string]>> = {
  door: [
    ["rv_door_leaf_depth", "Spessore totale anta"],
    ["rv_door_fixed_frame_depth", "Profondità telaio fisso (non controtelaio)"],
    ["rv_door_handle_internal", "Sporgenza maniglia lato interno / B"],
    ["rv_door_handle_external", "Sporgenza maniglia lato esterno / A"],
    ["rv_door_space_internal", "Distanza libera da ostacoli lato interno / B"],
    ["rv_door_space_external", "Distanza libera da ostacoli lato esterno / A"],
  ],
  tapparella: [
    ["rv_tap_slat_thickness", "Spessore massimo stecca / telo rilevato"],
    ["rv_tap_max_thickness", "Spessore massimo telo ammesso · scheda guida"],
    ["rv_tap_slat_height", "Passo / altezza stecca"],
    ["rv_guide_width_sx", "Ingombro frontale guida SX"],
    ["rv_guide_width_dx", "Ingombro frontale guida DX"],
    ["rv_guide_outer_depth", "Ingombro esterno guide in profondità"],
    ["rv_guide_slot", "Luce utile di passaggio telo nella guida"],
    ["rv_tap_space", "Spazio disponibile in profondità per le guide"],
    ["rv_tap_roll_diameter", "Diametro telo avvolto · rilevato / da scheda"],
  ],
  zanzariera: [
    ["rv_zan_total_depth", "Profondità totale installata della zanzariera"],
    ["rv_zan_guide_width", "Ingombro frontale guide / telaio"],
    ["rv_zan_guide_depth", "Profondità / sporgenza guide o telaio"],
    ["rv_zan_pack_width", "Ingombro frontale raccolta lungo il movimento"],
    ["rv_zan_pack_depth", "Profondità raccolta / pacchetto chiuso"],
    ["rv_zan_handle_space", "Distanza minima da maniglie / persiane"],
  ],
};
export const ENVELOPE_MEASURE_KEYS = new Set(
  Object.values(fields)
    .flat()
    .map(([key]) => key),
);
const sideLabel = (label: string, interior: boolean) =>
  label
    .replace("lato interno / B", interior ? "lato B" : "lato interno")
    .replace("lato esterno / A", interior ? "lato A" : "lato esterno");
export function installationFields(
  family: Family,
  interior = false,
): FieldDefinition[] {
  return fields[family].map(([key, label]) => ({
    key,
    label: sideLabel(label, interior),
    type: "dimension",
    unit: "mm",
    width: 6,
    min: 0,
    max: 100000,
    step: 0.1,
    ...(key.includes("_pack_")
      ? {
          show_if: {
            field: "rv_zan_direction",
            operator: "not_in" as const,
            value: ["fissa", "battente"],
          },
        }
      : {}),
    help:
      key === "rv_zan_pack_width"
        ? "Verticale: altezza del cassonetto; laterale: larghezza del pacchetto chiuso. Per due campi, quota comune solo se le raccolte sono uguali; annotare eventuali differenze. Non è la profondità."
        : key === "rv_tap_max_thickness"
          ? "Limite dichiarato per il modello di guida. Non è dedotto dalla sua profondità."
          : key === "rv_guide_outer_depth"
            ? "Valore comune alle due guide solo se uguali; differenze vanno annotate nel tipo / sezione guide."
            : key.startsWith("rv_door_handle_")
              ? "Dalla superficie dell’anta chiusa al punto più sporgente; non è il raggio di apertura."
              : "Quota rilevata o da scheda tecnica, mai dedotta dalle misure del vano. Zero non genera una sagoma.",
  }));
}
export type InstallationEnvelope = {
  title: string;
  caption: string;
  measurements: Array<{ key: string; label: string; value: number | null }>;
  sketches: Array<{ title: string; scene: ScenaSerramento; keys: string[] }>;
  warnings: string[];
};
const positive = (value: unknown): number | null =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= 100000
    ? value
    : null;
export function installationEnvelope(
  key: string,
  values: Values,
  bounds?: { width: number; height: number },
): InstallationEnvelope | undefined {
  const family: Family | undefined = [
    "portoncino_blindato",
    "porta_interna",
  ].includes(key)
    ? "door"
    : key === "tapparella_standalone"
      ? "tapparella"
      : key === "zanzariera_standalone"
        ? "zanzariera"
        : undefined;
  if (!family) return;
  const fixed = ["fissa", "battente"].includes(String(values.rv_zan_direction));
  const definitions = fields[family].filter(
    ([k]) => !fixed || !k.includes("_pack_"),
  );
  const measured = (k: string) => (values[k] === 0 ? 0 : positive(values[k]));
  const measurements = definitions.map(([k, label]) => ({
    key: k,
    label: sideLabel(label, key === "porta_interna"),
    value: measured(k),
  }));
  if (family === "zanzariera")
    measurements.push(
      {
        key: "rv_zan_space",
        label: "Spazio utile per installazione",
        value: measured("rv_zan_space"),
      },
      {
        key: "rv_zan_guide_height",
        label: "Altezza effettiva guida / soglia",
        value: measured("rv_zan_guide_height"),
      },
    );
  const warnings: string[] = [],
    sketches: InstallationEnvelope["sketches"] = [];
  const get = (k: string) => positive(values[k]);
  const compare = (actual: string, capacity: string, message: string) => {
    const a = get(actual),
      b = get(capacity);
    if (a != null && (b != null || values[capacity] === 0) && a > (b ?? 0))
      warnings.push(message);
  };
  const pair = (title: string, widthKey: string, depthKey: string) => {
    const w = get(widthKey),
      d = get(depthKey);
    if (w == null || d == null) return;
    const scene = measuredScene(w, d, [
      { kind: "rect", ruolo: "pannello", x: 0, y: 0, w, h: d },
    ]);
    scene.stile = "scheda";
    scene.quote[0].testo = `${w} mm`;
    scene.quote[1].testo = `${d} mm`;
    sketches.push({ title, scene, keys: [widthKey, depthKey] });
  };
  if (family === "tapparella") {
    pair(
      "Guida SX · frontale × profondità",
      "rv_guide_width_sx",
      "rv_guide_outer_depth",
    );
    pair(
      "Guida DX · frontale × profondità",
      "rv_guide_width_dx",
      "rv_guide_outer_depth",
    );
    pair(
      "Stecca · passo × spessore massimo",
      "rv_tap_slat_height",
      "rv_tap_slat_thickness",
    );
    compare(
      "rv_tap_slat_thickness",
      "rv_tap_max_thickness",
      "Telo più spesso del massimo ammesso dichiarato per la guida: verificare il modello.",
    );
    compare(
      "rv_tap_slat_thickness",
      "rv_guide_slot",
      "Spessore telo maggiore della luce utile della guida: possibile incompatibilità.",
    );
    compare(
      "rv_guide_outer_depth",
      "rv_tap_space",
      "Le guide superano lo spazio disponibile in profondità: verificare posa e ostacoli.",
    );
    if (get("rv_tap_slat_thickness") && !get("rv_tap_max_thickness"))
      warnings.push(
        "Limite di spessore della guida da verificare sulla scheda del produttore.",
      );
  } else if (family === "zanzariera") {
    pair(
      fixed
        ? "Telaio · frontale × profondità"
        : "Guide · frontale × profondità",
      "rv_zan_guide_width",
      "rv_zan_guide_depth",
    );
    if (!fixed)
      pair(
        "Raccolta chiusa · frontale × profondità",
        "rv_zan_pack_width",
        "rv_zan_pack_depth",
      );
    for (const k of [
      "rv_zan_total_depth",
      "rv_zan_guide_depth",
      ...(!fixed ? ["rv_zan_pack_depth"] : []),
    ]) {
      compare(
        k,
        "rv_zan_space",
        "Un ingombro della zanzariera supera lo spazio utile: verificare la posa.",
      );
      if (k !== "rv_zan_total_depth")
        compare(
          k,
          "rv_zan_total_depth",
          "La profondità di un componente supera quella totale dichiarata della zanzariera: verificare le quote.",
        );
    }
    if (
      values.rv_zan_bottom_rail === "no" ||
      values.rv_zan_guide_system === "senza_barriera"
    ) {
      if (get("rv_zan_guide_height"))
        warnings.push(
          "Sistema senza guida a pavimento ma altezza della soglia presente: chiarire il riferimento della quota.",
        );
    }
    if (get("rv_zan_cassette_size") && !get("rv_zan_pack_width"))
      warnings.push(
        "Il precedente ingombro cassonetto / raccolta non definisce l’asse: rileva larghezza e profondità separate.",
      );
    if (bounds) {
      const panelWidth =
          bounds.width / (values.rv_zan_panels === "doppia" ? 2 : 1),
        guide = get("rv_zan_guide_width"),
        collection = get("rv_zan_pack_width"),
        axis =
          values.rv_zan_direction === "verticale" ? bounds.height : panelWidth;
      if (guide && guide * 2 >= Math.min(panelWidth, bounds.height))
        warnings.push(
          "Ingombro frontale delle guide incompatibile con il campo: quote da verificare, sagoma dei profili solo illustrativa.",
        );
      if (!fixed && collection && collection + 2 * (guide ?? 0) >= axis)
        warnings.push(
          "La raccolta chiusa occuperebbe tutto il campo: verificare gli ingombri; non viene rappresentata come misura valida.",
        );
      if (
        get("rv_zan_guide_height") &&
        get("rv_zan_guide_height")! >= bounds.height
      )
        warnings.push(
          "Altezza guida / soglia incompatibile con il vano: verificare il riferimento della quota.",
        );
    }
  } else {
    compare(
      "rv_door_handle_internal",
      "rv_door_space_internal",
      "La maniglia interna / B supera la distanza libera registrata: verificare l’ostacolo e i riferimenti.",
    );
    compare(
      "rv_door_handle_external",
      "rv_door_space_external",
      "La maniglia esterna / A supera la distanza libera registrata: verificare l’ostacolo e i riferimenti.",
    );
    // A one-axis depth comparison, not an invented leaf height or a fitted frame section.
    const depths = [
      "rv_door_leaf_depth",
      "rv_door_fixed_frame_depth",
      "rv_door_frame_depth",
    ];
    for (const k of depths) {
      const depth = get(k);
      if (depth == null) continue;
      const label =
        k === "rv_door_leaf_depth"
          ? "Anta"
          : k === "rv_door_fixed_frame_depth"
            ? "Telaio fisso"
            : "Controtelaio";
      sketches.push({
        title: `${label} · sola profondità`,
        keys: [k],
        scene: {
          larghezza: depth,
          altezza: depth * 0.35,
          sporgenza: 0,
          stile: "scheda",
          forme: [
            {
              kind: "poly",
              ruolo: "pannelloLinea",
              punti: [
                [0, depth * 0.175],
                [depth, depth * 0.175],
              ],
            },
          ],
          quote: [
            {
              orientamento: "h",
              lato: "sotto",
              da: 0,
              a: depth,
              testo: `${depth} mm`,
            },
          ],
        },
      });
    }
    if (
      values.rv_door_counterframe === "non_previsto" &&
      get("rv_door_frame_depth")
    )
      warnings.push(
        "Controtelaio non previsto ma sua profondità presente: verificare il dato, senza cancellarlo.",
      );
  }
  return {
    title: "Spessori e ingombri di posa",
    caption:
      "Quote in mm. Rettangoli di ingombro e confronti di profondità, non sezioni esecutive dei profili. Ogni dettaglio ha scala propria. Quote assenti non dedotte; misure del vano e del prodotto restano invariate. L’assenza di avvisi non certifica la compatibilità.",
    measurements,
    sketches,
    warnings: [...new Set(warnings)],
  };
}
