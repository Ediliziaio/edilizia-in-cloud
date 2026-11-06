export interface ConfigPavimentoStanza {
  attivo: boolean;
  tipo?: string;
  colore_hex?: string;
  colore_nome?: string;
  pattern?: string;
  finitura?: string;
  dimensione?: string;
  effetto_visivo?: string;
  /** Essenza del legno (chiavi del render pavimento): vale solo se il pavimento è legno o effetto legno. */
  essenza_legno?: string;
  formato_piastrella?: string;
  larghezza_listello_mm?: number;
  lunghezza_listello_mm?: number;
  fuga_larghezza_mm?: number;
  fuga_colore?: "bianco" | "grigio_chiaro" | "grigio_scuro" | "nero" | "beige" | "tono_su_tono";
  battiscopa_azione?: "mantieni" | "sostituisci" | "rimuovi";
  battiscopa_tipo?: "coordinato_pavimento" | "bianco" | "legno" | "alluminio";
  battiscopa_altezza_cm?: 6 | 8 | 10;
}
