import type { ConfigurazionePersiane } from "@/modules/render-persiane/lib/types";

export const DEFAULT_PERSIANE_CONFIG: ConfigurazionePersiane = {
  operazione: "sostituisci",
  tipo: "veneziana_classica",
  materiale: "legno_naturale",
  colore_mode: "ral",
  colore_ral: "9010",
  colore_nome: "Bianco puro",
  colore_hex: "#F7F5EF",
  stato_apertura: "chiuso",
  lamelle: {
    larghezza_mm: 50,
    apertura: "chiuse",
  },
  applica_tutte_finestre: true,
  target_mode: "all_visible",
  ferramenta_finitura: "verniciata_tinta",
  fermapersiana_visibile: true,
  mantieni_accessori_non_target: true,
};
