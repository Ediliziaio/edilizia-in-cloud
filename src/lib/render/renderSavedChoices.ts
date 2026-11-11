import { asRecord } from "./renderSessionData";
import { renderVisibleNotes } from "./renderVisibleNotes";
import {
  roomVisualChoices,
  type RoomVisualGroup,
} from "../../../shared/render-references/roomVisualCatalog.ts";
import type { PhotoEntry } from "../../../shared/render-references/referencePicker.ts";

const LABELS: Record<string, string> = {
  tipo: "Tipo",
  type: "Tipo",
  nome: "Nome",
  name: "Nome",
  stile: "Stile",
  stile_target: "Stile",
  tipo_stanza: "Ambiente",
  intensita: "Trasformazione",
  intensity: "Trasformazione",
  qualita_render: "Qualità",
  materiale: "Materiale",
  material: "Materiale",
  materialLabel: "Materiale",
  materialOrSystem: "Materiale / sistema",
  colore: "Colore",
  color: "Colore",
  colorLabel: "Colore",
  colorAndFinish: "Colore / finitura",
  colore_nome: "Nome colore",
  colore_hex: "Codice colore",
  colorHex: "Codice colore",
  hex: "Codice colore",
  ral: "RAL",
  finitura: "Finitura",
  finish: "Finitura",
  mode: "Tipo",
  openingLabel: "Apertura selezionata",
  frameDepthLabel: "Profondità telaio",
  hingeMode: "Tipo cerniere",
  woodEffectId: "Essenza legno",
  profileId: "Profilo",
  profilo: "Profilo",
  apertura_default: "Apertura",
  desiredOpeningType: "Apertura",
  desiredSashCount: "Numero ante",
  frameWidthCm: "Larghezza telaio (cm)",
  slimnessLabel: "Spessore del profilo",
  handleStyle: "Maniglia",
  handleFinish: "Finitura maniglia",
  handleCountVisible: "Maniglie",
  hingeFinish: "Finitura cerniere",
  hingeStyle: "Cerniere",
  hingesPerSash: "Cerniere per anta",
  glassSpec: "Vetro",
  isMotorized: "Motorizzato",
  colore_accento_nome: "Nome colore accento",
  colore_accento_hex: "Codice colore accento",
  colore_base: "Colore di base",
  colore_principale_hex: "Colore principale",
  colore_travi: "Colore travi",
  colore_frontali_hex: "Colore frontali",
  colore_piano_lavoro_hex: "Colore piano di lavoro",
  effetto_visivo: "Effetto",
  essenza: "Essenza",
  formato: "Formato",
  formato_piastrella: "Formato",
  pattern: "Posa",
  fuga_larghezza_mm: "Fuga (mm)",
  fuga_colore: "Colore fuga",
  battiscopa_azione: "Battiscopa",
  battiscopa_tipo: "Tipo battiscopa",
  battiscopa_altezza_cm: "Altezza battiscopa (cm)",
  applica_a: "Applicazione",
  pareti_specifiche: "Pareti selezionate",
  stile_pattern: "Motivo",
  descrizione: "Descrizione",
  description: "Descrizione",
  temperatura: "Temperatura luce",
  intensita_luce: "Intensità luce",
  materiale_frontali: "Frontali cucina",
  piano_lavoro_materiale: "Piano di lavoro",
  maniglie: "Maniglie",
  mantieni_elettrodomestici: "Mantieni elettrodomestici",
  cambia_piano_cottura: "Cambia piano cottura",
  intensita_cambio: "Intervento arredi",
  operazione: "Operazione",
  azione: "Azione",
  intervento: "Intervento",
  tipo_intervento: "Intervento",
  interventionPreset: "Intervento",
  targetArea: "Area d’intervento",
  preserveNotes: "Elementi da preservare",
  technicalDetails: "Dettagli dell’intervento",
  note_libere: "Note",
  notes: "Note",
  layout_strategy: "Disposizione",
  elementi_da_mantenere: "Da mantenere",
  elementi_da_aggiungere: "Da aggiungere",
  elementi_da_rimuovere: "Da rimuovere",
  note_tecniche: "Note tecniche",
  larghezza: "Larghezza",
  altezza: "Altezza",
  profondita: "Profondità",
  lunghezza: "Lunghezza",
  dimensioni: "Dimensioni",
  forma: "Forma",
  posizione: "Posizione",
  orientamento: "Orientamento",
  accessori: "Accessori",
  dimensione: "Dimensione",
  materiale_nome: "Materiale",
  colore_telaio: "Colore telaio",
  colore_lamelle: "Colore lamelle",
  copertura: "Copertura",
  materiale_copertura: "Materiale copertura",
  installazione: "Installazione",
  apertura: "Apertura",
  vetro: "Vetro",
  texture: "Texture",
};
Object.assign(LABELS, {
  effetto: "Effetto",
  posa: "Posa",
  essenza_legno: "Essenza legno",
  colore_mode: "Selezione colore",
  colore_ral: "RAL",
  pattern_posa: "Posa",
  variazione_tono: "Variazione del tono",
  bisellatura: "Bisellatura",
  direzione_posa: "Direzione di posa",
  scala_pattern: "Scala della posa",
  soglie_porte: "Soglie",
  giunto_perimetrale: "Giunto perimetrale",
  fasce_bordo: "Fasce di bordo",
  larghezza_listello_mm: "Larghezza listello (mm)",
  lunghezza_listello_mm: "Lunghezza listello (mm)",
  tappeti: "Tappeti",
  altezza_cm: "Altezza (cm)",
  larghezza_cm: "Larghezza (cm)",
  lunghezza_m: "Lunghezza (m)",
  larghezza_m: "Larghezza (m)",
  zona: "Zona",
  sistema: "Sistema",
  spessore_cm: "Spessore (cm)",
  colore_finitura_hex: "Colore finitura",
  altezza_rivestimento: "Altezza rivestimento",
  orientamento_lastra: "Orientamento lastre",
  box_vetro: "Vetro doccia",
  piatto: "Piatto doccia",
  soffione: "Soffione",
  nicchia: "Nicchia",
  scarico: "Scarico",
  rubinetteria_vasca: "Rubinetteria vasca",
  dimensione_cm: "Dimensioni (cm)",
  parete_doccia: "Parete sopravasca",
  piano: "Piano",
  lavabo: "Lavabo",
  numero_lavabi: "Numero lavabi",
  specchio: "Specchio",
  azione_wc: "Intervento WC",
  tipo_wc: "Tipo WC",
  azione_bidet: "Intervento bidet",
  tipo_bidet: "Tipo bidet",
  piastra_wc: "Placca WC",
  piastra_wc_colore: "Colore placca WC",
  illuminazione_tipo: "Illuminazione",
  illuminazione: "Illuminazione",
  arredo: "Arredo",
  effetto_legno: "Effetto legno",
  stato_apertura: "Stato di apertura",
  lamelle: "Lamelle",
  numero_ante: "Numero ante",
  colore_profilo_diverso: "Profilo con colore distinto",
  colore_profilo_hex: "Colore profilo",
  applica_tutte_finestre: "Applica a tutte le finestre",
  ferramenta_finitura: "Finitura ferramenta",
  mantieni_accessori_non_target: "Mantieni accessori esistenti",
  posizione_descrittiva: "Posizione",
  footprint_apparente: "Ingombro apparente",
  dimensione_apparente: "Dimensioni apparenti",
  larghezza_apparente: "Larghezza apparente",
  lunghezza_apparente: "Lunghezza apparente",
  profondita_apparente: "Profondità apparente",
  quota_bordo: "Quota del bordo",
  rapporto_con_casa: "Rapporto con la casa",
  rapporto_con_prato: "Rapporto con il prato",
  rapporto_con_deck: "Rapporto con il deck",
  interferenze_note: "Interferenze",
  sistema_bordo: "Sistema bordo",
  colore_acqua: "Colore acqua",
  rivestimento_interno: "Rivestimento interno",
  rivestimento_esterno: "Rivestimento esterno",
  coping: "Bordo perimetrale",
  area_perimetrale: "Area perimetrale",
  fuga_bordo: "Fuga del bordo",
  superficie_ripristino: "Superficie di ripristino",
  accesso: "Accesso",
  stato: "Stato",
  colore_telo_nome: "Colore telo",
  colore_telo_hex: "Codice colore telo",
  trasparenza: "Trasparenza",
  gestisci_arredo: "Intervento arredi",
  uso_area: "Uso dell’area",
  addossata_si_no: "Addossata",
  distanza_da_facciata: "Distanza dalla facciata",
  descrizione_zona: "Zona d’installazione",
  altezza_apparente: "Altezza apparente",
  numero_montanti: "Numero montanti",
  posizione_montanti: "Posizione montanti",
  ancoraggio_a_terra: "Ancoraggio",
  rapporto_con_porte_finestre: "Rapporto con le aperture",
  elementi_da_preservare: "Elementi da preservare",
  fermapersiana_visibile: "Fermapersiana visibile",
});
const SECTIONS: Record<string, string> = {
  piastrelle_parete: "Piastrelle pareti",
  doccia: "Doccia",
  vasca: "Vasca",
  vanity: "Mobile bagno",
  sanitari: "Sanitari",
  rubinetteria: "Rubinetteria",
  parete: "Pareti",
  termoarredo: "Termoarredo",
  battiscopa: "Battiscopa",
  intonaco: "Intonaco",
  rivestimento: "Rivestimento",
  cappotto: "Cappotto",
  elementi: "Elementi architettonici",
  verniciatura: "Pittura pareti",
  pavimento: "Pavimento",
  infissi_progetto: "Infissi comuni del progetto",
  arredo: "Arredo",
  soffitto: "Soffitto",
  illuminazione: "Illuminazione",
  carta_da_parati: "Carta da parati",
  rivestimento_pareti: "Rivestimenti",
  tende: "Tende",
  restyling_cucina: "Cucina",
  spazi_dettagli: "Spazi e dettagli",
  technical_specification: "Specifiche selezionate",
  nuovo_infisso: "Infisso",
  finish: "Finitura",
  cassonetto: "Cassonetto",
  shutter: "Oscurante",
  struttura: "Struttura",
  copertura: "Copertura",
  chiusure_laterali: "Chiusure laterali",
  installazione: "Installazione",
  piscina: "Piscina",
  finiture: "Finiture",
  comfort: "Comfort",
  inserimento: "Inserimento",
  manto: "Manto del tetto",
  grondaie: "Grondaie",
  lucernari: "Lucernari",
  pannelli_solari: "Pannelli solari",
  legacy_config: "Scelte salvate",
  opzioni: "Opzioni",
};
const INTERNAL =
  /(?:prompt|manifest|analysis|analisi|scene|provider|schema|signature|fingerprint|reference|boards|metadata|photo_meta|snapshot|validation|target_selection|target_map|integrity|constraints|rules|directives|credit|billing|token|cost|costo|addebito|api|planimetria|materiali_visivi|_payload|input_image_meta|riferimenti_condivisi)/i;
export interface SavedRenderChoice {
  key: string;
  group: string;
  label: string;
  value: string;
  color?: string;
}
const readable = (value: unknown): string | null => {
  if (typeof value === "boolean") return value ? "Sì" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim())
    return value.replace(/_/g, " ");
  if (Array.isArray(value) && value.every((item) => typeof item === "string"))
    return value.join(", ").replace(/_/g, " ") || null;
  return null;
};

/** Mostra solo valori realmente salvati. Non applica i default dei form ai render storici. */
export function savedRenderChoices(config: unknown): SavedRenderChoice[] {
  const choices: SavedRenderChoice[] = [];
  const walk = (value: unknown, path: string, group: string, depth: number) => {
    if (depth > 8) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        walk(item, `${path}.${index}`, `${group} ${index + 1}`, depth + 1),
      );
      return;
    }
    const record = asRecord(value);
    if (record.attivo === false) return;
    if (record.replace === false) {
      choices.push({
        key: path,
        group,
        label: "Intervento",
        value: "Mantieni esistente",
      });
      return;
    }
    for (const [key, entry] of Object.entries(record)) {
      if (INTERNAL.test(key)) continue;
      const text = LABELS[key] ? readable(key === "note_libere" ? renderVisibleNotes(entry) : entry) : null;
      if (text !== null) {
        const color =
          typeof entry === "string" &&
          /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(entry.trim())
            ? entry.trim()
            : undefined;
        choices.push({
          key: `${path}.${key}`,
          group,
          label: LABELS[key],
          value: text,
          color,
        });
      } else if (entry && typeof entry === "object")
        walk(
          entry,
          `${path}.${key}`,
          SECTIONS[key]
            ? group === "Scelte del render"
              ? SECTIONS[key]
              : `${group} · ${SECTIONS[key]}`
            : group,
          depth + 1,
        );
    }
  };
  walk(config, "config", "Scelte del render", 0);
  return choices;
}

export interface SavedRenderSample {
  id: string;
  label: string;
  photo: PhotoEntry;
}
export function savedRenderSamples(config: unknown): SavedRenderSample[] {
  const cfg = asRecord(config);
  const specs: Array<[string | null, string, RoomVisualGroup]> = [
    [null, "stile_target", "style"],
    ["pavimento", "tipo", "floor_type"],
    ["pavimento", "effetto_visivo", "floor_effect"],
    ["pavimento", "essenza_legno", "floor_essence"],
    ["pavimento", "pattern", "floor_pattern"],
    ["pavimento", "finitura", "floor_finish"],
    ["verniciatura", "finitura", "paint_finish"],
    ["carta_da_parati", "stile_pattern", "wallpaper_pattern"],
    ["arredo", "materiale", "furniture_material"],
    ["rivestimento_pareti", "tipo", "cladding_type"],
    ["soffitto", "tipo", "ceiling_type"],
    ["illuminazione", "tipo", "lighting_type"],
    ["tende", "tipo", "curtain_type"],
    ["restyling_cucina", "materiale_frontali", "kitchen_front"],
    ["restyling_cucina", "piano_lavoro_materiale", "kitchen_worktop"],
    ["infissi_progetto", "profilo", "window_profile"],
  ];
  return specs.flatMap(([section, field, group]) => {
    const values = section ? asRecord(cfg[section]) : cfg;
    if (section && section !== "infissi_progetto" && values.attivo !== true)
      return [];
    if (typeof values[field] !== "string") return [];
    // Una superficie composita senza effetto/essenza espliciti non autorizza una foto di default.
    if (group === "floor_type") {
      const wood =
        ["parquet_legno", "parquet_laminato", "vinile_lvt"].includes(
          String(values.tipo),
        ) || values.effetto_visivo === "legno";
      if (
        wood &&
        !roomVisualChoices("floor_essence", config).some(
          (option) => option.value === values.essenza_legno,
        )
      )
        return [];
      if (
        ["gres_porcellanato", "vinile_lvt"].includes(String(values.tipo)) &&
        !roomVisualChoices("floor_effect", config).some(
          (option) => option.value === values.effetto_visivo,
        )
      )
        return [];
    }
    const choice = roomVisualChoices(group, config).find(
      (option) => option.value === values[field],
    );
    return choice?.photo
      ? [
          {
            id: `${group}:${choice.value}`,
            label: choice.label,
            photo: choice.photo,
          },
        ]
      : [];
  });
}
