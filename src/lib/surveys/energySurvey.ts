import type {
  ElementTypeDefinition,
  FieldDefinition,
  FieldSection,
  SurveyTemplateRow,
  DimensionUnit,
  SurveyRow,
  SurveyElementRow,
} from "@/types/surveys";

export type EnergyKind =
  | "roof"
  | "inverter"
  | "battery"
  | "board"
  | "meter"
  | "route"
  | "wallbox"
  | "indoor"
  | "outdoor"
  | "heatpump"
  | "hybrid"
  | "tank";
export type EnergyValues = Record<string, unknown>;
export const ENERGY_KINDS: Record<string, EnergyKind> = {
  en_falda: "roof",
  inverter: "inverter",
  accumulo: "battery",
  quadro_elettrico: "board",
  contatore: "meter",
  percorso_cavi: "route",
  wallbox: "wallbox",
  split: "indoor",
  en_unita_esterna: "outdoor",
  pompa_calore: "heatpump",
  en_ibrido: "hybrid",
  en_percorso_termico: "route",
  en_accumulo_termico: "tank",
};
const option = (
  key: string,
  label: string,
  pairs: string[][],
  required = false,
): FieldDefinition => ({
  key,
  label,
  type: "select",
  width: 6,
  required,
  options: pairs.map(([value, label]) => ({ value, label })),
});
const num = (
  key: string,
  label: string,
  unit?: DimensionUnit,
  min = 0,
  max = 100000,
): FieldDefinition => ({
  key,
  label,
  type: unit ? "dimension" : "number",
  unit,
  min,
  max,
  step:
    unit === "mm" ? 1 : ["m", "kw", "kwh"].includes(unit ?? "") ? 0.01 : 0.1,
  width: 6,
});
const txt = (key: string, label: string): FieldDefinition => ({
  key,
  label,
  type: "text",
  width: 12,
});
const group = (
  key: string,
  label: string,
  fields: FieldDefinition[],
): FieldSection => ({ key, label, fields, default_open: true });
const photo = (key: string, label: string, required = false) => ({
  key,
  label,
  required,
  multiple: true,
});
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
export const energyKind = (
  t: ElementTypeDefinition | undefined,
): EnergyKind | undefined =>
  t?.sections.some((s) => s.key.startsWith("en_"))
    ? ENERGY_KINDS[t.key]
    : undefined;
export const isEnergySurvey = (t: ElementTypeDefinition | undefined) =>
  !!energyKind(t);
/** Do not retroactively add mandatory fields to historical signed/closed dossiers. */
export function shouldEnrichEnergySurvey(
  survey: Pick<SurveyRow, "status" | "client_signature_at" | "header_data">,
  elements: Pick<SurveyElementRow, "values">[],
): boolean {
  const recorded = [survey.header_data, ...elements.map((e) => e.values)].some(
    (values) => Object.keys(values ?? {}).some((k) => k.startsWith("en_")),
  );
  return (
    recorded ||
    (!survey.client_signature_at &&
      ["draft", "in_progress"].includes(survey.status))
  );
}
export function energySections(kind: EnergyKind): FieldSection[] {
  const sections = [
    group("en_identification", "Intervento e origine dei dati", [
      option(
        "en_action",
        "Intervento previsto",
        [
          ["nuovo", "Nuova fornitura / posa"],
          ["sostituire", "Sostituire"],
          ["mantenere", "Esistente da mantenere"],
          ["rilevare", "Solo rilievo / da decidere"],
        ],
        true,
      ),
      option(
        "en_basis",
        "Origine delle misure",
        [
          ["rilevato", "Rilevate sul posto"],
          ["progetto", "Da progetto identificato"],
          ["stimato", "Stima preliminare"],
          ["da_verificare", "Da rilevare"],
        ],
        true,
      ),
      txt("en_reference", "Tecnico, data e documento di riferimento"),
      txt("en_model", "Produttore / modello / scheda tecnica"),
    ]),
  ];
  if (kind === "roof")
    sections.push(
      group("en_roof", "Falda e disposizione moduli", [
        {
          ...num("en_width", "Larghezza superficie di posa", "m", 0.01),
          required: true,
        },
        {
          ...num("en_height", "Lunghezza superficie di posa", "m", 0.01),
          required: true,
        },
        option(
          "en_plane",
          "Riferimento superficie",
          [
            ["falda", "Misure sul piano inclinato della falda"],
            [
              "orizzontale",
              "Proiezione orizzontale, da convertire prima della posa",
            ],
          ],
          true,
        ),
        num("en_tilt", "Inclinazione falda", "gradi", 0, 90),
        num("en_azimuth", "Azimut da Nord, senso orario", "gradi", 0, 360),
        option("en_cover", "Copertura", [
          ["tegole", "Tegole / coppi"],
          ["lamiera", "Lamiera"],
          ["piano", "Copertura piana"],
          ["altro", "Altro / da descrivere"],
        ]),
        {
          ...num("en_module_width", "Lato corto modulo", "mm", 1),
          required: true,
        },
        {
          ...num("en_module_height", "Lato lungo modulo", "mm", 1),
          required: true,
        },
        {
          ...num(
            "en_module_watt",
            "Potenza nominale singolo modulo · W",
            undefined,
            1,
          ),
          required: true,
        },
        {
          ...num("en_count", "Numero moduli proposto", undefined, 1, 200),
          step: 1,
          required: true,
        },
        option(
          "en_orientation",
          "Orientamento moduli",
          [
            ["verticale", "Verticale"],
            ["orizzontale", "Orizzontale"],
          ],
          true,
        ),
        {
          ...num("en_margin", "Fascia esclusa dal bordo · da progetto", "m"),
          help: "Non è una distanza di sicurezza predefinita. Inserisci il limite concordato con il progettista.",
        },
        num("en_gap", "Interspazio fra moduli · da progetto", "m", 0, 5),
        txt(
          "en_shading",
          "Ombre locali: ostacoli, orari, stagioni e riferimento rilievo",
        ),
        txt(
          "en_structure",
          "Struttura, fissaggi / zavorre e verifica strutturale di riferimento",
        ),
      ]),
    );
  else if (kind === "route")
    sections.push(
      group("en_route", "Percorso e opere accessorie", [
        {
          ...txt("en_from", "Da: apparecchiatura / punto di partenza"),
          required: true,
        },
        {
          ...txt("en_to", "A: apparecchiatura / punto di arrivo"),
          required: true,
        },
        option(
          "en_route_kind",
          "Tipo di percorso",
          [
            ["dc", "Elettrico DC"],
            ["ac", "Elettrico AC"],
            ["frigorifero", "Frigorifero"],
            ["idraulico", "Idraulico"],
            ["condensa", "Scarico condensa"],
            ["comando", "Comando / dati"],
          ],
          true,
        ),
        {
          ...num("en_length", "Lunghezza rilevata del tratto", "m", 0.01),
          required: true,
        },
        num("en_rise", "Dislivello rilevato", "m", 0, 1000),
        txt(
          "en_existing_route",
          "Canalizzazione / tubazione esistente e condizioni",
        ),
        txt(
          "en_crossings",
          "Attraversamenti, opere murarie, ripristini e accessibilità",
        ),
        txt(
          "en_route_spec",
          "Sezione / diametro / isolamento da progetto, non calcolati automaticamente",
        ),
        option("en_drain", "Condensa: soluzione da verificare", [
          ["gravita", "Scarico a gravità"],
          ["pompa", "Pompa condensa prevista"],
          ["non_pertinente", "Non pertinente"],
          ["da_verificare", "Da verificare"],
        ]),
      ]),
    );
  else
    sections.push(
      group("en_measure", "Apparecchiatura e ingombri", [
        {
          ...num("en_count", "Numero apparecchi identici", undefined, 1, 100),
          step: 1,
          required: true,
        },
        num("en_width_mm", "Larghezza apparecchio", "mm", 1),
        num("en_depth_mm", "Profondità apparecchio", "mm", 1),
        num("en_height_mm", "Altezza apparecchio", "mm", 1),
        num("en_space_width", "Spazio disponibile · larghezza", "mm"),
        num("en_space_depth", "Spazio disponibile · profondità", "mm"),
        ...["front", "back", "left", "right"].flatMap((side, i) => [
          num(
            `en_free_${side}`,
            `Spazio libero ${["frontale", "posteriore", "sinistro", "destro"][i]}`,
            "mm",
          ),
          num(
            `en_min_${side}`,
            `Minimo da manuale · ${["frontale", "posteriore", "sinistro", "destro"][i]}`,
            "mm",
          ),
        ]),
        txt(
          "en_location",
          "Posizione, supporti, accesso manutenzione e vincoli",
        ),
        ...(["battery", "tank"].includes(kind)
          ? [
              num(
                "en_capacity",
                kind === "battery"
                  ? "Capacità accumulo elettrico"
                  : "Volume accumulo termico",
                kind === "battery" ? "kwh" : "l",
                0.01,
              ),
            ]
          : []),
        ...([
          "inverter",
          "wallbox",
          "indoor",
          "outdoor",
          "heatpump",
          "hybrid",
        ].includes(kind)
          ? [num("en_power", "Potenza nominale dichiarata", "kw", 0.01)]
          : []),
      ]),
    );
  if (["indoor", "outdoor", "heatpump", "hybrid"].includes(kind))
    sections.push(
      group("en_thermal", "Circuito e verifica termotecnica", [
        option("en_configuration", "Configurazione", [
          ["monosplit", "Monosplit"],
          ["multisplit", "Multisplit"],
          ["canalizzato", "Canalizzato"],
          ["monoblocco", "PDC monoblocco"],
          ["split", "PDC split"],
          ["ibrido", "PDC + caldaia"],
          ["altro", "Altro"],
        ]),
        option("en_refrigerant", "Refrigerante da targhetta / manuale", [
          ["r32", "R32"],
          ["r290", "R290"],
          ["r410a", "R410A"],
          ["altro", "Altro"],
          ["da_verificare", "Da verificare"],
        ]),
        txt(
          "en_load_reference",
          "Calcolo del carico termico e condizioni di progetto · riferimento",
        ),
        num(
          "en_flow_temp",
          "Temperatura di mandata da progetto",
          "°C",
          -20,
          100,
        ),
        num(
          "en_return_temp",
          "Temperatura di ritorno da progetto",
          "°C",
          -20,
          100,
        ),
        option("en_terminals", "Terminali prevalenti", [
          ["radiatori", "Radiatori"],
          ["radiante", "Radiante"],
          ["fancoil", "Ventilconvettori"],
          ["aria", "Unità aria"],
          ["misto", "Misti, da descrivere"],
        ]),
        txt(
          "en_acs",
          "ACS: fabbisogno, accumulo, ricircolo e schema di riferimento",
        ),
        txt("en_noise", "Rumore, vicinato, vibrazioni e verifica acustica"),
        txt(
          "en_connections",
          "Alimentazione e collegamenti da progetto; protezioni e sezioni da verificare",
        ),
      ]),
    );
  if (kind === "hybrid")
    sections.push(
      group("en_hybrid", "Caldaia e integrazione ibrida", [
        {
          ...txt(
            "en_boiler_model",
            "Caldaia esistente / prevista · marca e modello",
          ),
          required: true,
        },
        num("en_boiler_power", "Potenza caldaia da targhetta", "kw", 0.01),
        txt(
          "en_gas_flue",
          "Alimentazione gas, scarico fumi e condensa: stato documentale / verifica",
        ),
        {
          ...txt(
            "en_hybrid_kit",
            "Kit, centralina e documento di compatibilità PDC-caldaia",
          ),
          required: true,
        },
        txt(
          "en_hybrid_strategy",
          "Schema idraulico e strategia di gestione da progetto",
        ),
      ]),
    );
  if (["board", "meter", "inverter", "battery", "wallbox"].includes(kind))
    sections.push(
      group("en_electrical", "Rilievo elettrico e documenti", [
        option("en_phase", "Alimentazione rilevata", [
          ["mono", "Monofase"],
          ["tri", "Trifase"],
          ["da_verificare", "Da verificare"],
        ]),
        txt(
          "en_electrical_reference",
          "POD / quadro / linea di riferimento e documentazione disponibile",
        ),
        txt(
          "en_protections",
          "Protezioni esistenti, terra e verifiche da eseguire da tecnico abilitato",
        ),
        txt(
          "en_backup",
          "Backup/EPS: utenze richieste, circuito dedicato e compatibilità da progetto",
        ),
      ]),
    );
  sections.push(
    group("en_verify", "Verifiche e note", [
      option(
        "en_technical_check",
        "Verifica tecnica specifica",
        [
          ["da_verificare", "Da verificare"],
          ["documentata", "Verifica documentata"],
          ["non_pertinente", "Non pertinente, motivare"],
        ],
        true,
      ),
      txt("en_check_reference", "Documento e tecnico della verifica"),
      {
        ...txt("en_notes", "Note, esclusioni e informazioni mancanti"),
        type: "textarea",
      },
    ]),
  );
  if (kind === "indoor" || kind === "outdoor") {
    for (const section of sections) for (const field of section.fields) {
      if (["en_flow_temp","en_return_temp","en_terminals","en_acs"].includes(field.key))
        field.show_if={field:"en_configuration",operator:"not_in",value:["monosplit","multisplit","canalizzato"]};
    }
  }
  return sections;
}
const TYPES: Array<[string, EnergyKind, string]> = [
  ["en_falda", "roof", "Falda e posa moduli"],
  ["inverter", "inverter", "Inverter"],
  ["accumulo", "battery", "Accumulo elettrico"],
  ["quadro_elettrico", "board", "Quadro elettrico"],
  ["contatore", "meter", "Contatore"],
  ["percorso_cavi", "route", "Percorso cavi"],
  ["wallbox", "wallbox", "Wallbox"],
  ["split", "indoor", "Unità interna clima"],
  ["en_unita_esterna", "outdoor", "Unità esterna clima"],
  ["pompa_calore", "heatpump", "Pompa di calore aria-acqua"],
  ["en_ibrido", "hybrid", "Sistema ibrido PDC + caldaia"],
  ["en_percorso_termico", "route", "Percorso tubazioni / condensa"],
  ["en_accumulo_termico", "tank", "Accumulo termico / ACS"],
];
/** Runtime extension: no company field is replaced, no database record is seeded or modified. */
export function withEnergySurveyProducts(
  template: SurveyTemplateRow,
): SurveyTemplateRow {
  if (!["fotovoltaico", "climatizzazione"].includes(template.category))
    return template;
  const copy = structuredClone(template),
    pv = copy.category === "fotovoltaico";
  for (const [key, kind, label] of TYPES.filter(([, k]) =>
    pv
      ? [
          "roof",
          "inverter",
          "battery",
          "board",
          "meter",
          "route",
          "wallbox",
        ].includes(k)
      : ["indoor", "outdoor", "heatpump", "hybrid", "tank", "route"].includes(
          k,
        ),
  )) {
    if (
      (pv && key === "en_percorso_termico") ||
      (!pv && key === "percorso_cavi")
    )
      continue;
    let type = copy.schema.element_types.find((t) => t.key === key);
    if (!type) {
      type = {
        key,
        label,
        label_plural: label,
        sections: [],
        required_photos: [],
        allow_quantity: false,
        estimate_category: `energia_${kind}`,
      };
      copy.schema.element_types.push(type);
    }
    const existing = new Set(
      type.sections.flatMap((s) => s.fields.map((f) => f.key)),
    );
    for (const s of energySections(kind)) {
      const added = s.fields.filter((f) => !existing.has(f.key));
      added.forEach((f) => existing.add(f.key));
      const section = type.sections.find((old) => old.key === s.key);
      if (section) section.fields.push(...added);
      else if (added.length) type.sections.push({ ...s, fields: added });
    }
    for (const p of [
      photo("en_context", "Contesto e accessibilità", true),
      photo(
        "en_plate",
        kind === "roof"
          ? "Copertura, ostacoli e riferimenti di misura"
          : "Targhetta / modello / schema di riferimento",
        true,
      ),
      photo("en_details", "Particolari, percorsi e criticità"),
    ])
      if (!type.required_photos.some((old) => old.key === p.key))
        type.required_photos.push(p);
  }
  const header = group(
    "en_objective",
    pv ? "Obiettivo impianto fotovoltaico" : "Obiettivo impianto termico",
    [
      option(
        "en_scenario",
        "Intervento richiesto",
        pv
          ? [
              ["nuovo", "Nuovo fotovoltaico"],
              ["ampliamento", "Ampliamento"],
              ["accumulo", "Accumulo su FV esistente"],
              ["sostituzione", "Sostituzione componenti"],
            ]
          : [
              ["clima", "Climatizzazione"],
              ["pdc", "Pompa di calore"],
              ["ibrido", "Sistema ibrido"],
              ["acs", "ACS / integrazione impianto"],
            ],
        true,
      ),
      txt(
        "en_customer_goal",
        "Esigenze, impianto esistente, utenze e limiti concordati",
      ),
      ...(pv
        ? [
            num("en_annual_kwh", "Consumo annuo documentato", "kwh"),
            num("en_available_kw", "Potenza elettrica disponibile", "kw"),
          ]
        : [
            txt(
              "en_building_reference",
              "Immobile, isolamento, locali e documenti energetici disponibili",
            ),
          ]),
      txt(
        "en_access_safety",
        "Accesso, sollevamenti, rischi e verifiche preliminari del tecnico",
      ),
    ],
  );
  const known = new Set(
    copy.schema.header_schema.flatMap((s) => s.fields.map((f) => f.key)),
  );
  const fields = header.fields.filter((f) => !known.has(f.key));
  const target = copy.schema.header_schema.find((s) => s.key === header.key);
  if (target) target.fields.push(...fields);
  else if (fields.length) copy.schema.header_schema.push({ ...header, fields });
  return copy;
}
export function energyIssues(
  type: ElementTypeDefinition,
  v: EnergyValues,
): string[] {
  const kind = energyKind(type);
  if (!kind) return [];
  const checks: string[] = [];
  if (kind !== "route" && !String(v.en_model ?? "").trim())
    checks.push(
      "Produttore, modello e scheda tecnica da specificare prima della fornitura.",
    );
  if (
    !["roof", "route"].includes(kind) &&
    ["en_width_mm", "en_depth_mm", "en_height_mm"].some(
      (key) => !positive(v[key]),
    )
  )
    checks.push(
      "Ingombri apparecchiatura da rilevare: larghezza, profondità e altezza.",
    );
  if (
    kind === "route" &&
    ["en_from", "en_to", "en_route_kind"].some(
      (key) => !String(v[key] ?? "").trim(),
    )
  )
    checks.push("Partenza, arrivo e tipo di percorso da completare.");
  if (v.en_basis !== "rilevato" && v.en_basis !== "progetto")
    checks.push(
      "Dati stimati o origine non confermata: verificare prima del progetto e della fornitura.",
    );
  if (
    v.en_technical_check !== "documentata" ||
    !String(v.en_check_reference ?? "").trim()
  )
    checks.push(
      "Verifica tecnica e riferimento documentale da completare; il rilievo non certifica conformità o compatibilità.",
    );
  if (kind === "roof") {
    if (v.en_plane !== "falda")
      checks.push(
        "Disposizione sul piano inclinato non confermata: non usare la proiezione orizzontale come superficie di posa.",
      );
    if (!String(v.en_structure ?? "").trim())
      checks.push(
        "Struttura e fissaggi da verificare: nessun carico o ancoraggio dimensionato automaticamente.",
      );
  }
  for (const side of ["front", "back", "left", "right"]) {
    const free = v[`en_free_${side}`],
      min = v[`en_min_${side}`];
    if (typeof free === "number" && positive(min) && free < min)
      checks.push(
        `Spazio ${({ front: "frontale", back: "posteriore", left: "sinistro", right: "destro" } as Record<string, string>)[side]} inferiore al minimo del manuale registrato: verificare il posizionamento.`,
      );
  }
  for (const [measure, space, label] of [
    ["en_width_mm", "en_space_width", "larghezza"],
    ["en_depth_mm", "en_space_depth", "profondità"],
  ])
    if (
      positive(v[measure]) &&
      typeof v[space] === "number" &&
      Number(v[measure]) > Number(v[space])
    )
      checks.push(`Apparecchiatura oltre lo spazio disponibile in ${label}.`);
  if (
    ["heatpump", "hybrid"].includes(kind) &&
    !String(v.en_load_reference ?? "").trim()
  )
    checks.push(
      "Calcolo termotecnico da acquisire: potenza non dimensionata dai soli metri quadri.",
    );
  if (
    kind === "hybrid" &&
    (!String(v.en_hybrid_kit ?? "").trim() ||
      !String(v.en_boiler_model ?? "").trim())
  )
    checks.push(
      "Compatibilità pompa di calore, caldaia e kit ibrido da documentare.",
    );
  return checks;
}
