import type { ConfigurazionePavimento } from "@/modules/render-pavimento/lib/types";

export const DEFAULT_PAVIMENTO_CONFIG: ConfigurazionePavimento = {
  tipo: "gres_porcellanato",
  finitura: "opaco",
  colore_mode: "free",
  colore_nome: "Gres cemento grigio chiaro",
  colore_hex: "#b0b0b0",
  effetto_visivo: "cemento",
  variazione_tono: "leggera",
  bisellatura: "nessuna",
  direzione_posa: "segue_prospettiva",
  scala_pattern: "standard",
  soglie_porte: "mantieni",
  giunto_perimetrale: "standard_nascosto",
  fasce_bordo: "nessuna",
  pattern_posa: "rettilineo_dritto",
  formato_piastrella: "60x60",
  fuga_larghezza_mm: 2,
  fuga_colore: "tono_su_tono",
  battiscopa: {
    azione: "mantieni",
  },
  note_libere: "",
};
