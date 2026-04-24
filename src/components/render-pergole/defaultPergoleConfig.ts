import type { ConfigurazionePergole } from "@/modules/render-pergole/lib/types";

export const DEFAULT_PERGOLE_CONFIG: ConfigurazionePergole = {
  operazione: "add_new_pergola",
  installazione: {
    zona: "addossata_facciata",
    addossata_si_no: true,
    distanza_da_facciata: "aderente",
    larghezza_apparente: "media",
    profondita_apparente: "standard",
    altezza_apparente: "standard",
    numero_montanti: 2,
    posizione_montanti: "frontali_visibili",
    ancoraggio_a_terra: "pavimento",
    rapporto_con_porte_finestre: "Mantieni porte-finestre e oscuranti utilizzabili, senza tagliare infissi o soglie.",
  },
  struttura: {
    tipo: "bioclimatica_addossata",
    materiale: "alluminio",
    colore_nome: "Antracite RAL 7016",
    colore_hex: "#30343B",
    finitura: "opaca",
    stile: "premium_contemporaneo",
  },
  copertura: {
    tipo: "lamelle_orientabili",
    stato: "lamelle_45",
    trasparenza: "opaco",
  },
  chiusure_laterali: {
    tipo: "nessuna",
    stato: "aperte",
    colore_nome: "Coerente con struttura",
  },
  illuminazione: "nessuna",
  arredo: {
    gestisci_arredo: "mantieni",
    uso_area: "relax",
  },
  elementi_da_preservare: ["facciata", "serramenti", "pavimentazione fuori ingombro", "giardino/contesto"],
  note_libere: "",
};
