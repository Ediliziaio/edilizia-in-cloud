import type { ConfigurazioneGiardino } from "@/modules/render-giardini/lib/types";

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
