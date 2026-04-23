import type { ConfigurazioneFacciata } from "@/modules/render-facciata/lib/types";

export const DEFAULT_FACCIATA_CONFIG: ConfigurazioneFacciata = {
  tipo_intervento: "tinteggiatura",
  intonaco: {
    attivo: true,
    colore_hex: "#F2EEE4",
    colore_ral: "1013",
    colore_nome: "Bianco perla",
    finitura: "liscio",
    zona: "tutta",
  },
  rivestimento: {
    attivo: false,
    tipo: "travertino",
    zona: "piano_terra",
    posa: "corsi_regolari",
    fuga_colore: "grigio chiaro",
  },
  cappotto: {
    attivo: false,
    spessore_cm: 10,
    sistema: "eps",
    colore_finitura_hex: "#F2EEE4",
    zona: "tutta",
  },
  elementi: {
    cornici_finestre: { azione: "mantieni" },
    marcapiani: { azione: "mantieni" },
    davanzali: { azione: "mantieni" },
    zoccolatura: { azione: "mantieni" },
    gronde: { azione: "mantieni" },
    balconi_ringhiere: { azione: "mantieni" },
  },
  note_libere: "",
};
