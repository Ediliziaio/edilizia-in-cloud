// shared/render-technical/defaults.ts
//
// Configurazioni di default dei moduli tecnici, in un posto importabile sia dal
// frontend sia dalle edge function.
//
// Prima vivevano solo sotto src/components/*, che le edge NON possono importare:
// per questo l'edge tecnica non poteva mai costruire una config ricca e usava
// la tabella generica a sette campi — con il risultato che quattro librerie di
// prompt (giardini, pavimenti esterni, porte interne, porte blindate) non
// raggiungevano mai il modello. Le librerie normalizzano con un cast senza
// controlli (`raw as ConfigurazioneX`), quindi partire da un default COMPLETO
// e' l'unico modo sicuro di costruire la config dai campi generici.
//
// I default di giardino e porte sono quelli del frontend, spostati qui e
// ri-esportati da li'. Quello dei pavimenti esterni non esisteva: e' scritto
// qui, coerente con il preset "gres outdoor grande formato" della pagina.

import type { ConfigurazioneGiardino } from "../render-garden/types.ts";
import type { ConfigurazionePortaInterna } from "../render-interior-door/types.ts";
import type { ConfigurazionePortaBlindata } from "../render-security-door/types.ts";
import type { ConfigurazionePavimentoEsterno } from "../render-exterior-floor/types.ts";

export const DEFAULT_GARDEN_CONFIG: ConfigurazioneGiardino = {
  stile: "contemporaneo",
  interventi: ["restyling_completo"],
  target_zones: ["prato_principale", "perimetro"],
  prato: {
    attivo: true,
    tipo: "prato_resistente",
  },
  aiuole: {
    attivo: true,
    tipo: "perimetrale",
    densita: "media",
    palette: "verde_strutturale",
  },
  siepi: {
    attivo: false,
    tipo: "schermante_media",
    altezza: "media",
  },
  alberi: {
    attivo: false,
    quantita: 2,
    scala: "media",
    portamento: "ornamentale",
  },
  camminamenti: {
    attivo: false,
    tipo: "stepping_stones",
  },
  ground_cover: {
    attivo: false,
    tipo: "ghiaia",
  },
  arredo: {
    modalita: "mantieni",
  },
  illuminazione: "nessuna",
  declutter: false,
  elementi_da_preservare: ["casa", "facciata", "hardscape non target"],
  elementi_da_rimuovere: [],
  note_libere: "",
};

export const DEFAULT_INTERIOR_DOOR_CONFIG: ConfigurazionePortaInterna = {
  interventi: ["replace_existing_door"],
  door_type: "rasomuro",
  leaf_config: "singola",
  context: "corridoio",
  stile: "minimal",
  finish: "laccato_bianco",
  colore: "bianco caldo opaco",
  frame: {
    tipo: "rasomuro",
    colore: "bianco coordinato parete",
    coprifilo: "assente",
  },
  glass: {
    enabled: false,
    type: "satinato",
    privacy_level: "medio",
  },
  hardware: {
    elementi: ["maniglia_moderna", "cerniere_scomparse"],
    finitura: "nero_opaco",
  },
  height: "standard",
  opening_direction: "non_visibile",
  apertura: {
    vano_target: "porta_principale",
    larghezza_apparente: "standard",
    altezza_apparente: "standard",
    rapporto_con_parete: "porta integrata nella parete del corridoio esistente",
    rapporto_con_zoccolino: "zoccolino da preservare o raccordare pulitamente vicino al vano",
    rapporto_con_soffitto: "altezza standard sotto il soffitto visibile",
    spazio_scorrimento_parete: "ridotto",
    interferenze_note: [],
  },
  elementi_da_preservare: ["pareti non target", "pavimento", "zoccolino", "arredi e interruttori vicini"],
  elementi_da_rimuovere: [],
  note_libere: "",
};

export const DEFAULT_SECURITY_DOOR_CONFIG: ConfigurazionePortaBlindata = {
  interventi: ["replace_existing_door"],
  door_type: "appartamento_moderna",
  leaf_type: "anta_singola",
  side_context: "lato_interno",
  visible_side: "interno",
  stile: "moderno",
  finitura_lato_visibile: "effetto_legno",
  finitura_interna: "effetto_legno",
  finitura_esterna: "liscio_opaco",
  colore_lato_visibile: "rovere chiaro naturale",
  colore_interno: "rovere chiaro naturale",
  colore_esterno: "antracite opaco",
  frame: {
    tipo: "minimale",
    colore: "antracite coordinato",
    coprifilo: "minimale",
  },
  hardware: {
    elementi: ["maniglia_moderna", "defender_visibile", "spioncino_standard"],
    finitura: "nero_opaco",
    posizione: "standard",
  },
  vetri: {
    fiancoluce: false,
    sopraluce: false,
    finitura_vetro: "satinato",
  },
  soglia: {
    attiva: true,
    materiale: "alluminio",
    finitura: "anodizzato scuro",
  },
  apertura: {
    vano_target: "porta_principale",
    larghezza_apparente: "standard",
    altezza_apparente: "standard",
    profondita_spallette: "media",
    presenza_fiancoluce: false,
    presenza_sopraluce: false,
    rapporto_con_parete: "porta centrata nel vano esistente con pareti da preservare",
    rapporto_con_pavimento: "soglia allineata al pavimento fotografato",
    interferenze_note: [],
  },
  elementi_da_preservare: ["pareti circostanti", "pavimento", "zoccolini", "interruttori/citofono se visibili"],
  elementi_da_rimuovere: [],
  note_libere: "",
};

export const DEFAULT_EXTERIOR_FLOOR_CONFIG: ConfigurazionePavimentoEsterno = {
  operazione: "replace_existing_surface",
  inserimento: {
    area_target: "patio",
    posizione_descrittiva: "superficie esterna principale visibile in foto",
    quota_apparente: "a_filo",
    rapporto_con_casa: "a contatto con la facciata, soglie e ingressi da preservare",
    rapporto_con_prato: "bordo netto verso il prato, senza sconfinare",
    rapporto_con_piscina: "nessuna piscina o bordo vasca da preservare",
    rapporto_con_gradini: "gradini esistenti da raccordare senza modificarne la geometria",
    pendenza_apparente: "leggera_verso_giardino",
    drenaggio_percepito: "non_visibile",
    interferenze_note: "",
  },
  materiale: "gres_outdoor",
  finitura: "antiscivolo",
  colore_nome: "grigio caldo",
  formato: "90x90",
  pattern_posa: "rettilineo",
  giunto: "fuga_sottile",
  larghezza_giunto_mm: 4,
  bordo: "nessuno",
  gradino: "nessuno",
  uso: "pedonale",
  elementi_da_rimuovere: [],
  elementi_da_preservare: ["casa", "facciata", "prato", "piscina", "arredi", "vegetazione"],
  note_libere: "",
};
