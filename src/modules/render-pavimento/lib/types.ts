export type TipoPavimento =
  | "parquet_massello"
  | "parquet_prefinito"
  | "laminato"
  | "gres_porcellanato"
  | "ceramica"
  | "marmo"
  | "pietra_naturale"
  | "vinile_lvt"
  | "cotto"
  | "cemento_resina"
  | "moquette"
  | "terrazzo_veneziano";

export type FinituraPavimento =
  | "lucido"
  | "opaco"
  | "satinato"
  | "spazzolato"
  | "boccardato"
  | "anticato"
  | "levigato"
  | "naturale"
  | "cerato";

export type PatternPosa =
  | "rettilineo_dritto"
  | "a_correre"
  | "sfalsato_33"
  | "spina_di_pesce"
  | "spina_ungherese"
  | "diagonale_45"
  | "cassero_irregolare"
  | "opus_romanum"
  | "doppia_fila"
  | "modulare"
  | "esagonale";

export interface ConfigurazionePavimento {
  tipo: TipoPavimento;
  finitura: FinituraPavimento;
  colore_mode: "palette" | "ral" | "legno" | "free";
  colore_nome?: string;
  colore_hex?: string;
  colore_ral?: string;
  pattern_posa: PatternPosa;
  formato_piastrella?: string;
  larghezza_listello_mm?: number;
  lunghezza_listello_mm?: number;
  fuga_larghezza_mm?: number;
  fuga_colore?: "bianco" | "grigio_chiaro" | "grigio_scuro" | "nero" | "beige" | "tono_su_tono";
  battiscopa?: {
    azione: "mantieni" | "sostituisci" | "rimuovi";
    tipo?: "coordinato_pavimento" | "bianco" | "legno" | "alluminio";
    altezza_cm?: 6 | 8 | 10;
  };
  note_libere?: string;
}

export interface AnalisiPavimento {
  tipo_stanza: string;
  pavimento_attuale: string;
  colore_attuale: string;
  dimensione_stimata: string;
  stato_conservazione: string;
  battiscopa_presente: boolean;
  note?: string;
}
