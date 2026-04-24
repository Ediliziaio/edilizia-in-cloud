import type { ConfigurazionePortaInterna } from "@/modules/render-porte-interne/lib/types";

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
