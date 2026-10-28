import { makeSurveyDetail } from "./surveyDetail";
import type { SurveyAreaRow } from "@/types/surveys";
import {
  withEnergySurveyProducts,
  type EnergyValues,
} from "@/lib/surveys/energySurvey";
import { proposeEnergyLayout } from "@/lib/surveys/energyDrawing";
import type { ListinoComponentiFv } from "@/lib/fotovoltaico/componentiConfigurazione";
export type EnergyScenario = "fotovoltaico" | "clima" | "pdc" | "ibrido";
export const ENERGY_SCENARIOS: EnergyScenario[] = [
  "fotovoltaico",
  "clima",
  "pdc",
  "ibrido",
];
export const ENERGY_CATALOG: ListinoComponentiFv = {
  pannelli: [
    {
      id: "sim-panel",
      descrizione: "SIMULAZIONE · modulo 450 W",
      potenza_w: 450,
      larghezza_mm: 1134,
      altezza_mm: 1762,
      prezzo_vendita: 150,
    },
  ],
  inverter: [
    {
      id: "sim-inverter",
      descrizione: "SIMULAZIONE · inverter 6 kW",
      potenza_kw: 6,
      prezzo_vendita: 1600,
    },
  ],
  accumuli: [
    {
      id: "sim-battery",
      descrizione: "SIMULAZIONE · accumulo 10 kWh",
      capacita_kwh: 10,
      prezzo_vendita: 4000,
    },
  ],
};
export function makeEnergySurvey(scenario: EnergyScenario = "fotovoltaico") {
  const d = makeSurveyDetail(),
    pv = scenario === "fotovoltaico",
    original = d.elements[0],
    area = d.areas[0];
  d.survey = {
    ...d.survey,
    id: `simulation-energy-${scenario}`,
    code: `SIM-ENERGIA-${scenario.toUpperCase()}`,
    client_id: null,
    order_id: null,
    address: "Immobile dimostrativo, nessun cantiere reale",
    address_number: null,
    city: "Località simulata",
    zip: null,
    province: null,
    latitude: null,
    longitude: null,
    notes:
      "SIMULAZIONE LOCALE. Valori, documenti e catalogo fittizi; nessuna verifica reale, nessuna firma o trasmissione.",
    header_data: {
      en_scenario: pv ? "nuovo" : scenario,
      en_customer_goal: pv
        ? "Valutazione FV con due falde, accumulo e wallbox"
        : "Riqualificazione comfort e ACS · simulazione",
      en_annual_kwh: 6500,
      en_available_kw: 6,
      en_access_safety:
        "Accesso e sollevamento da verificare sul cantiere reale; scenario sintetico.",
    },
  };
  d.template = {
    ...d.template,
    category: pv ? "fotovoltaico" : "climatizzazione",
    name: pv
      ? "Sopralluogo fotovoltaico · SIMULAZIONE"
      : `Sopralluogo ${scenario} · SIMULAZIONE`,
    schema: {
      version: 1,
      header_schema: [],
      area_definition: {
        label: pv ? "Zona impianto" : "Locale / zona",
        label_plural: "Zone",
        fields: [],
        required_photos: [],
      },
      element_types: [],
      general_required_photos: [],
    },
  };
  d.template = withEnergySurveyProducts(d.template);
  const areas = pv
    ? [
        "Falda sud-est",
        "Falda sud-ovest",
        "Locale tecnico",
        "Quadro / allaccio",
      ]
    : scenario === "clima"
      ? ["Soggiorno", "Camera", "Terrazzo", "Percorsi"]
      : ["Locale tecnico", "Esterno", "Percorsi"];
  d.areas = areas.map(
    (name, i): SurveyAreaRow => ({
      ...area,
      id: `${d.survey.id}-area-${i}`,
      survey_id: d.survey.id,
      name,
      position: i,
      area_data: {},
      notes: null,
      audio_url: null,
      audio_transcription: null,
    }),
  );
  d.elements = [];
  d.media = [];
  const common: EnergyValues = {
    en_action: "nuovo",
    en_basis: "rilevato",
    en_reference: "SIMULAZIONE · tecnico fittizio · 27/10/2026",
    en_technical_check: "documentata",
    en_check_reference:
      "SIMULAZIONE: riferimento fittizio per test, NON verifica tecnica reale",
    en_count: 1,
    en_width_mm: 900,
    en_height_mm: 800,
    en_depth_mm: 350,
    en_space_width: 1800,
    en_space_depth: 1500,
    en_free_left: 300,
    en_free_right: 300,
    en_free_front: 700,
    en_free_back: 200,
    en_min_left: 200,
    en_min_right: 200,
    en_min_front: 500,
    en_min_back: 150,
    en_location: "Posizione sintetica, accessibile nella simulazione",
    en_model: "Prodotto dimostrativo · da sostituire con il modello reale",
  };
  function add(
    key: string,
    label: string,
    areaIndex: number,
    values: EnergyValues = {},
  ) {
    d.elements.push({
      ...original,
      id: `${d.survey.id}-element-${d.elements.length}`,
      survey_id: d.survey.id,
      area_id: d.areas[areaIndex].id,
      element_type: key,
      element_label: label,
      values: { ...common, ...values },
      quantity: 1,
      notes: "Dati sintetici, non utilizzare per ordini o dimensionamento.",
      position: d.elements.length,
      is_complete: false,
      missing_required_fields: [],
    });
  }
  const route = (
    label: string,
    from: string,
    to: string,
    length: number,
    kind: string,
    areaIndex: number,
  ) =>
    add(pv ? "percorso_cavi" : "en_percorso_termico", label, areaIndex, {
      en_from: from,
      en_to: to,
      en_length: length,
      en_rise: 3,
      en_route_kind: kind,
      en_route_spec: "SIMULAZIONE: sezione / diametro da progetto identificato",
      en_crossings: "Un attraversamento e relativo ripristino da verificare",
      en_drain: kind === "condensa" ? "gravita" : "non_pertinente",
    });
  if (pv) {
    for (let i = 0; i < 2; i++) {
      const values: EnergyValues = {
        ...common,
        en_count: 7,
        en_width: 6,
        en_height: 5,
        en_plane: "falda",
        en_tilt: 25,
        en_azimuth: i ? 225 : 135,
        en_cover: "tegole",
        en_module_width: 1134,
        en_module_height: 1762,
        en_module_watt: 450,
        en_orientation: "verticale",
        en_margin: 0.4,
        en_gap: 0.03,
        en_structure:
          "SIMULAZIONE · relazione strutturale fittizia / sistema fissaggio da progetto",
        en_model: "SIMULAZIONE · modulo 450 W",
        en_obstacles: [{ x: 4.9, y: 3.9, w: 0.5, h: 0.5, label: "Comignolo" }],
        en_shading:
          "Ostacolo misurato, analisi ombreggiamento reale non eseguita",
      };
      values.en_layout = proposeEnergyLayout(values);
      add("en_falda", `Moduli falda ${i ? "sud-ovest" : "sud-est"}`, i, values);
    }
    add("inverter", "Inverter 6 kW", 2, {
      en_power: 6,
      en_phase: "mono",
      en_model: "SIMULAZIONE · inverter 6 kW",
    });
    add("accumulo", "Accumulo 10 kWh", 2, {
      en_capacity: 10,
      en_model: "SIMULAZIONE · accumulo 10 kWh",
    });
    add("wallbox", "Wallbox 7,4 kW · limitazione dinamica da verificare", 2, {
      en_power: 7.4,
      en_model: "SIMULAZIONE · wallbox",
    });
    add("quadro_elettrico", "Adeguamento quadro AC/DC", 3, {
      en_phase: "mono",
    });
    add("contatore", "Contatore esistente · NON nuova fornitura", 3, {
      en_action: "mantenere",
      en_phase: "mono",
      en_electrical_reference: "POD omesso: simulazione",
    });
    route("Linea DC prima falda", "Falda SE", "Inverter", 18, "dc", 2);
    route("Linea DC seconda falda", "Falda SO", "Inverter", 22, "dc", 2);
    route("Linea AC", "Inverter", "Quadro", 8, "ac", 3);
  } else if (scenario === "clima") {
    add("split", "Unità interna soggiorno", 0, {
      en_power: 3.5,
      en_configuration: "multisplit",
      en_refrigerant: "r32",
    });
    add("split", "Unità interna camera", 1, {
      en_power: 2.5,
      en_configuration: "multisplit",
      en_refrigerant: "r32",
    });
    add("en_unita_esterna", "Unità esterna multisplit", 2, {
      en_power: 5.2,
      en_configuration: "multisplit",
      en_refrigerant: "r32",
      en_noise:
        "Verifica acustica specifica da tecnico; nessun valore inventato",
    });
    route(
      "Linea soggiorno",
      "Esterna",
      "Interna soggiorno",
      8,
      "frigorifero",
      3,
    );
    route("Linea camera", "Esterna", "Interna camera", 12, "frigorifero", 3);
    route(
      "Scarico condensa",
      "Unità interne",
      "Punto scarico da progetto",
      14,
      "condensa",
      3,
    );
  } else {
    add(
      scenario === "ibrido" ? "en_ibrido" : "pompa_calore",
      scenario === "ibrido"
        ? "Sistema ibrido con caldaia esistente"
        : "Pompa di calore aria-acqua",
      1,
      {
        en_power: 8,
        en_configuration: scenario === "ibrido" ? "ibrido" : "monoblocco",
        en_refrigerant: "r290",
        en_load_reference:
          "SIMULAZIONE · relazione carichi termici fittizia, nessun dimensionamento da mq",
        en_flow_temp: 40,
        en_return_temp: 35,
        en_terminals: "radiante",
        en_boiler_model:
          scenario === "ibrido" ? "SIMULAZIONE · caldaia esistente 24 kW" : "",
        en_boiler_power: 24,
        en_hybrid_kit:
          scenario === "ibrido"
            ? "SIMULAZIONE · kit e centralina con compatibilità fittizia verificata nel test"
            : "",
        en_gas_flue: "Stato e scarico fumi da accertare sul posto",
        en_hybrid_strategy:
          "Schema fittizio, validazione progettista necessaria nel caso reale",
      },
    );
    add("en_accumulo_termico", "Accumulo ACS 200 litri", 0, {
      en_capacity: 200,
    });
    route("Mandata / ritorno", "Generatore", "Collettore", 10, "idraulico", 2);
    route("Alimentazione comando", "Quadro", "Generatore", 15, "comando", 2);
    route(
      "Scarico condensa",
      "Generatore",
      "Scarico previsto",
      5,
      "condensa",
      2,
    );
  }
  return d;
}
