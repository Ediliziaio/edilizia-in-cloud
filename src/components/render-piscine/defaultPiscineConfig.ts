import type { ConfigurazionePiscine } from "@/modules/render-piscine/lib/types";

export const DEFAULT_PISCINE_CONFIG: ConfigurazionePiscine = {
  operazione: "add_new_pool",
  inserimento: {
    zona: "giardino_centrale",
    footprint_apparente: "media",
    larghezza_apparente: "media",
    lunghezza_apparente: "media",
    profondita_apparente: "standard",
    quota_bordo: "a_filo_terreno",
    rapporto_con_casa: "Mantieni facciata, porte-finestre, soglie e passaggi esistenti liberi e credibili.",
    rapporto_con_prato: "Raccorda prato e bordo piscina con taglio pulito e realistico.",
    rapporto_con_deck: "Crea o preserva solo il deck/solarium strettamente necessario al perimetro piscina.",
  },
  piscina: {
    tipo: "interrata_rettangolare",
    forma: "rettangolare",
    dimensione_apparente: "media",
    sistema_bordo: "skimmer",
    colore_acqua: "cristallina_chiara",
  },
  finiture: {
    rivestimento_interno: "mosaico_grigio",
    coping: "travertino",
    area_perimetrale: "prato_raccordato",
    fuga_bordo: "sottile",
  },
  comfort: {
    accesso: "gradini_angolo",
    accessori: [],
    illuminazione: "nessuna",
    arredo: "mantieni",
  },
  elementi_da_preservare: ["casa/facciata", "porte e finestre", "alberi importanti", "aree esterne non target", "prospettiva originale"],
  note_libere: "",
};
