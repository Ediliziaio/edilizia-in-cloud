export type TipoInterventoFacciata = "tinteggiatura" | "cappotto" | "rivestimento" | "misto" | "rifacimento_totale";

export interface ConfigIntonaco {
  attivo: boolean;
  colore_hex: string;
  colore_ral?: string;
  colore_nome?: string;
  finitura: "liscio" | "graffiato_fine" | "graffiato_medio" | "rasato" | "bucciato" | "strutturato_grosso" | "rustico" | "veneziana" | "bugnato";
  zona: "tutta" | "piano_terra" | "piani_superiori" | "zoccolatura" | "fasce_orizzontali";
}

export interface ConfigRivestimento {
  attivo: boolean;
  tipo: "pietra_serena" | "travertino" | "arenaria_beige" | "luserna" | "marmo_bianco" | "porfido" | "splitface_grigio" | "pietra_rustica" | "cotto_rosso" | "clinker_rosso" | "clinker_grigio" | "clinker_beige" | "cotto_mattone" | "laterizio_bianco";
  zona: "tutta" | "piano_terra" | "piani_superiori" | "zoccolatura" | "cantonali" | "marcapiano";
}

export interface ConfigCappotto {
  attivo: boolean;
  spessore_cm: 4 | 6 | 8 | 10 | 12 | 14;
  sistema: "eps" | "lana_roccia" | "fibra_legno";
  colore_finitura_hex: string;
}

export interface ConfigElementiArchitettonici {
  cornici_finestre: { azione: "mantieni" | "aggiungi" | "rimuovi"; colore_hex?: string };
  marcapiani: { azione: "mantieni" | "aggiungi"; colore_hex?: string; spessore?: string };
  davanzali: { azione: "mantieni" | "sostituisci"; materiale?: "pietra" | "marmo" | "alluminio"; colore_hex?: string };
  zoccolatura: { azione: "mantieni" | "aggiungi"; tipo?: "intonaco" | "pietra" | "ceramica"; colore_hex?: string; altezza_cm?: number };
  gronde: { azione: "mantieni" | "sostituisci"; colore_hex?: string; materiale?: "rame" | "alluminio" | "pvc" };
  balconi_ringhiere: { azione: "mantieni" | "vernicia"; colore_hex?: string };
}

export interface ConfigurazioneFacciata {
  tipo_intervento: TipoInterventoFacciata;
  intonaco: ConfigIntonaco;
  rivestimento: ConfigRivestimento;
  cappotto: ConfigCappotto;
  elementi: ConfigElementiArchitettonici;
  note_libere?: string;
}

export interface AnalisiFacciata {
  tipo_edificio: string;
  numero_piani: number;
  numero_finestre: number;
  intonaco_attuale: string;
  colore_attuale_hex: string;
  stato_conservazione: string;
  elementi_presenti: string[];
  note?: string;
}
