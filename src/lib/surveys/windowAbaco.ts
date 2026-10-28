/** Original survey abaco. Installation views are schematic, NOT manufacturing sections.
 * No profile, offset, tolerance or order measurement is inferred from another size. */
import type {
  AntaDisegno,
  Forma,
  ScenaSerramento,
} from "@/lib/serramenti/disegnoSerramento";
import type { FieldDefinition, FieldSection } from "@/types/surveys";

type Values = Record<string, unknown>;
/** Empty guidance stays in the app; export full installation diagrams only after details are entered. */
export const windowAbacoHasDetails = (values: Values) =>
  Object.entries(values).some(
    ([key, value]) => /^rv_abaco_/.test(key) && value != null && value !== "",
  );
export type WindowAbaco = {
  measurements: Array<{
    label: string;
    width: number | null;
    height: number | null;
  }>;
  figures: Array<{ title: string; scene: ScenaSerramento; caption: string }>;
  notes: string[];
  checks: string[];
};
const dimension = (key: string, label: string): FieldDefinition => ({
  key: `rv_abaco_${key}`,
  label,
  type: "dimension",
  unit: "mm",
  min: 0.1,
  max: 100000,
  step: 0.1,
  width: 6,
});
export function windowAbacoSections(): FieldSection[] {
  return [
    {
      key: "rv_abaco_misure",
      label: "Abaco · misure distinte, in mm",
      fields: [
        ...[
          ["rough", "Vano rustico"],
          ["counter", "Controtelaio · ingombro esterno"],
          ["window", "Infisso · ingombro esterno telaio"],
        ].flatMap(([key, label]) => [
          {
            ...dimension(`${key}_width`, `${label} · larghezza`),
            help:
              key === "rough"
                ? "Vuoto: usa le misure principali solo se dichiarate del foro. Nessuna misura finita viene calcolata."
                : "Misura autonoma: non viene ricavata dalle altre quote.",
          },
          dimension(`${key}_height`, `${label} · altezza`),
        ]),
      ],
    },
    {
      key: "rv_abaco_posa",
      label: "Abaco · telaio, controtelaio e sezione di posa",
      fields: [
        {
          key: "rv_abaco_counterframe",
          label: "Controtelaio",
          type: "select",
          width: 6,
          options: [
            { value: "presente", label: "Esistente, da verificare" },
            { value: "nuovo", label: "Nuovo da fornire / posare" },
            { value: "assente", label: "Non previsto" },
            { value: "da_verificare", label: "Presenza da rilevare" },
          ],
        },
        {
          key: "rv_abaco_swing",
          label: "Battenti · apertura verso",
          type: "select",
          width: 6,
          options: [
            { value: "interno", label: "Interno" },
            { value: "esterno", label: "Esterno" },
            { value: "da_verificare", label: "Da confermare" },
          ],
          help: "Cerniere e lati delle ante si leggono sempre dalla vista interna. Non si assume un verso predefinito.",
        },
        dimension("wall_depth", "Spessore muro rilevato"),
        dimension("frame_depth", "Profondità telaio rilevata"),
        {
          key: "rv_abaco_reference",
          label: "Serie telaio / controtelaio, battute, fissaggi e raccordi",
          type: "textarea",
          width: 12,
          help: "Indica il riferimento del produttore o allega la sezione esecutiva. I profili nell’abaco restano illustrativi.",
        },
      ],
    },
  ];
}
const positive = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100000
    ? v
    : null;
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
  ...(dashed ? { tratteggio: true } : {}),
});
const blank = (w: number, h: number, forme: Forma[]): ScenaSerramento => ({
  larghezza: w,
  altezza: h,
  sporgenza: 0,
  stile: "scheda",
  quote: [],
  forme,
});

export function windowAbaco(
  values: Values,
  leaves: AntaDisegno[],
  primary: { width: number; height: number; isRough: boolean },
): WindowAbaco {
  const read = (key: string) => positive(values[`rv_abaco_${key}`]);
  const rough = (axis: "width" | "height") => {
    const raw = values[`rv_abaco_rough_${axis}`];
    return raw == null || raw === ""
      ? primary.isRough
        ? primary[axis]
        : null
      : read(`rough_${axis}`);
  };
  const measurements = [
    {
      label: "Vano rustico",
      width: rough("width"),
      height: rough("height"),
    },
    {
      label: "Controtelaio · esterno",
      width: read("counter_width"),
      height: read("counter_height"),
    },
    {
      label: "Infisso · esterno telaio",
      width: read("window_width"),
      height: read("window_height"),
    },
  ];
  const notes = [
    "Pianta e sezione schematiche, non in scala. Quote autonome: nessuna tolleranza o misura d’ordine dedotta. Posizione nel muro, giochi e spessori dei profili sono illustrativi.",
  ];
  const counter = ["presente", "nuovo"].includes(
    String(values.rv_abaco_counterframe),
  );
  if (!counter && values.rv_abaco_counterframe !== "assente")
    notes.push(
      "Controtelaio da rilevare: non viene aggiunto automaticamente al disegno.",
    );
  if (
    values.rv_abaco_counterframe === "assente" &&
    (read("counter_width") || read("counter_height"))
  )
    notes.push(
      "Controtelaio non previsto ma con misure inserite: verifica la discordanza prima di ordinare.",
    );
  for (const axis of ["width", "height"] as const) {
    const rough = measurements[0][axis],
      ct = measurements[1][axis],
      win = measurements[2][axis];
    if (
      (rough && win && win > rough) ||
      (counter && ((rough && ct && ct > rough) || (ct && win && win > ct)))
    )
      notes.push(
        `${axis === "width" ? "Larghezze" : "Altezze"} discordanti fra vano e ingombri: verificare battute e riferimento di misura, senza correzioni automatiche.`,
      );
  }
  if (
    (primary.isRough &&
      read("rough_width") &&
      read("rough_width") !== primary.width) ||
    (primary.isRough &&
      read("rough_height") &&
      read("rough_height") !== primary.height)
  )
    notes.push(
      "Vano rustico dell’abaco diverso dalle misure principali del foro: verifica quale rilievo è aggiornato.",
    );
  const cell = 680 / Math.max(1, leaves.length),
    toward = values.rv_abaco_swing,
    planHeight = Math.max(1000, 2 * (cell + 70)),
    center = planHeight / 2;
  const plan = blank(1000, planHeight, [
    rect("parete", 0, center - 70, 100, 140),
    rect("parete", 900, center - 70, 100, 140),
  ]);
  if (counter)
    plan.forme.push(
      rect("telaio", 100, center - 55, 25, 110),
      rect("telaio", 875, center - 55, 25, 110),
    );
  plan.forme.push(
    rect("telaio", 125, center - 35, 35, 70),
    rect("telaio", 840, center - 35, 35, 70),
  );
  // Symbols, including equal leaf widths, deliberately carry NO measured leaf dimensions.
  let missingSwing = false,
    special = false;
  leaves.forEach((leaf, i) => {
    const x = 160 + i * cell,
      y = center;
    plan.forme.push(
      line([
        [x, y],
        [x + cell, y],
      ]),
    );
    if (["battente", "anta_ribalta"].includes(leaf.tipo) && leaf.lato) {
      if (toward !== "interno" && toward !== "esterno") {
        missingSwing = true;
        return;
      }
      // Inside viewer stands at the bottom of the plan, facing outside (top).
      const hinge = leaf.lato === "sx" ? x : x + cell;
      const start = leaf.lato === "sx" ? 0 : Math.PI,
        sign = toward === "interno" ? 1 : -1;
      const end = start + (sign * (leaf.lato === "sx" ? 1 : -1) * Math.PI) / 2,
        radius = cell;
      plan.forme.push(
        line(
          [
            [hinge, y],
            [hinge, y + sign * radius],
          ],
          true,
        ),
      );
      plan.forme.push(
        line(
          Array.from({ length: 25 }, (_, n): [number, number] => {
            const a = start + ((end - start) * n) / 24;
            return [hinge + Math.cos(a) * radius, y + Math.sin(a) * radius];
          }),
          true,
          true,
        ),
      );
    } else if (
      ["scorrevole", "alzante_scorrevole"].includes(leaf.tipo) &&
      leaf.lato
    ) {
      const mirrorSide = leaf.lato === "sx" ? -1 : 1,
        cx = x + cell / 2,
        cy = center + 25,
        tip = cx + mirrorSide * cell * 0.28;
      plan.forme.push(
        line(
          [
            [cx - mirrorSide * cell * 0.28, cy],
            [tip, cy],
            [tip - mirrorSide * cell * 0.1, cy - 15],
            [tip, cy],
            [tip - mirrorSide * cell * 0.1, cy + 15],
          ],
          true,
        ),
      );
    } else if (leaf.tipo !== "fisso") special = true;
  });
  if (missingSwing)
    notes.push(
      "Verso interno / esterno non confermato: nessun arco a battente in pianta.",
    );
  if (special)
    notes.push(
      "Ribalta, vasistas e libro: vedere il simbolo sul frontale; cinematismo e ingombri esecutivi richiedono la scheda del produttore.",
    );
  if (values.tipologia === "tonda_ovale")
    notes.push(
      "Sagoma tonda / ovale: pianta e sezione restano indicative; allegare il dettaglio del produttore.",
    );
  if (
    read("wall_depth") &&
    read("frame_depth") &&
    read("frame_depth")! > read("wall_depth")!
  )
    notes.push(
      "Profondità telaio maggiore dello spessore muro rilevato: verificare sporgenze e riferimento di misura.",
    );
  const measuredWidths = measurements.filter((m) => m.width);
  measuredWidths.forEach((m, i) =>
    plan.quote.push({
      orientamento: "h",
      lato: "sotto",
      da: 100 + i * 25,
      a: 900 - i * 25,
      testo: `${m.label.replace(" · esterno", "").replace(" telaio", "")} ${m.width} mm`,
      livello: i,
    }),
  );
  const section = blank(360, 1000, [
    rect("parete", 80, 0, 240, 125),
    rect("parete", 80, 850, 240, 150),
  ]);
  if (counter)
    section.forme.push(
      rect("telaio", 150, 125, 50, 30),
      rect("telaio", 150, 820, 50, 30),
    );
  section.forme.push(
    rect("telaio", 155, 155, 40, 50),
    rect("telaio", 155, 770, 40, 50),
    line([
      [175, 205],
      [175, 770],
    ]),
  );
  if (
    /^z_(30|35|60|65)$/.test(String(values.tipo_telaio)) &&
    Array.isArray(values.lati_con_z)
  ) {
    if (values.lati_con_z.includes("alto"))
      section.forme.push(rect("telaio", 195, 155, 25, 75));
    if (values.lati_con_z.includes("basso"))
      section.forme.push(rect("telaio", 195, 745, 25, 75));
  }
  const roughH = measurements[0].height,
    winH = measurements[2].height;
  if (roughH)
    section.quote.push({
      orientamento: "v",
      lato: "sx",
      da: 125,
      a: 850,
      testo: `Vano ${roughH} mm`,
    });
  if (winH)
    section.quote.push({
      orientamento: "v",
      lato: "dx",
      da: 155,
      a: 820,
      testo: `Infisso ${winH} mm`,
    });
  if (read("wall_depth"))
    section.quote.push({
      orientamento: "h",
      lato: "sotto",
      da: 80,
      a: 320,
      testo: `Muro ${read("wall_depth")} mm`,
    });
  if (read("frame_depth"))
    section.quote.push({
      orientamento: "h",
      lato: "sotto",
      da: 155,
      a: 195,
      testo: `Telaio ${read("frame_depth")} mm`,
      livello: 1,
    });
  return {
    measurements,
    figures: [
      {
        title: "Pianta · apertura e posa",
        scene: plan,
        caption:
          "ESTERNO in alto · INTERNO in basso. Cerniere e scorrimento riferiti al frontale interno; ante e posizioni schematiche, non sono luci nette di passaggio.",
      },
      {
        title: "Sezione verticale · telaio e raccordi",
        scene: section,
        caption: `Telaio ${String(values.tipo_telaio || "da identificare")
          .toUpperCase()
          .replaceAll(
            "_",
            " ",
          )}; ${counter ? "controtelaio rappresentato" : "controtelaio non rappresentato"}. Nessuna stratigrafia o sezione di produzione ricostruita.`,
      },
    ],
    notes,
    checks: notes.filter((n) =>
      /discordanti|diverso dalle misure|non previsto ma con misure|maggiore dello spessore/.test(
        n,
      ),
    ),
  };
}
