export type TipoIntervento =
  | "restyling_piastrelle"
  | "restyling_completo"
  | "demolizione_parziale"
  | "demolizione_completa";

export interface SostituzioneElementi {
  piastrelle_parete: boolean;
  pavimento: boolean;
  doccia: boolean;
  vasca: boolean;
  mobile_bagno: boolean;
  sanitari: boolean;
  rubinetteria: boolean;
  parete_colore: boolean;
  illuminazione: boolean;
}

export interface ConfigPiastrella {
  attivo: boolean;
  effetto: string;
  formato: string;
  posa: string;
  fuga_colore: string;
  altezza_rivestimento?: string;
}

export interface ConfigDoccia {
  attivo: boolean;
  tipo: "walk_in" | "nicchia_box" | "angolare" | "semicircolare";
  box_vetro: "trasparente" | "satinato" | "fume" | "serigrafato";
  piatto: "filo_pavimento" | "rialzato_3cm" | "rialzato_5cm" | "pietra";
  profilo: "cromato" | "nero_opaco" | "oro_spazzolato" | "senza_profilo";
  soffione: "a_parete" | "pioggia_soffitto" | "colonna_completa" | "combinato";
}

export interface ConfigVasca {
  attivo: boolean;
  tipo: "freestanding_ovale" | "freestanding_rettangolare" | "incassata" | "angolare";
  materiale: "acrilico_bianco" | "solid_surface" | "ghisa_smaltata" | "pietra";
  rubinetteria_vasca: "a_parete" | "a_pavimento" | "bordo_vasca";
}

export interface ConfigVanity {
  attivo: boolean;
  stile: "sospeso_moderno" | "sospeso_minimal" | "a_terra_classico" | "a_terra_industrial";
  colore: string;
  piano: "marmo_bianco" | "marmo_nero" | "quarzo" | "legno" | "ceramica";
  lavabo: "integrato" | "appoggio_ovale" | "appoggio_rettangolare" | "semincasso";
  larghezza_cm: 60 | 80 | 100 | 120 | 140;
}

export interface ConfigSanitari {
  attivo: boolean;
  azione_wc: "mantieni" | "sostituisci";
  tipo_wc: "sospeso" | "a_terra" | "rimless_sospeso";
  azione_bidet: "mantieni" | "sostituisci" | "rimuovi";
  tipo_bidet?: "sospeso" | "a_terra";
  colore: "bianco" | "grigio_chiaro" | "nero_opaco";
}

export interface ConfigRubinetteria {
  attivo: boolean;
  finitura: "cromo" | "nero_opaco" | "oro_spazzolato" | "oro_rosa" | "acciaio_spazzolato";
  stile: "quadro_moderno" | "tondo_classico" | "industrial" | "vintage_crosshead";
}

export interface ConfigParete {
  attivo: boolean;
  azione: "mantieni" | "tinta_unita" | "lastra_decorativa";
  colore_hex?: string;
}

export interface ConfigurazioneBagno {
  tipo_intervento: TipoIntervento;
  sostituzione: SostituzioneElementi;
  piastrelle_parete: ConfigPiastrella;
  pavimento: ConfigPiastrella;
  doccia: ConfigDoccia;
  vasca: ConfigVasca;
  vanity: ConfigVanity;
  sanitari: ConfigSanitari;
  rubinetteria: ConfigRubinetteria;
  parete: ConfigParete;
  illuminazione_tipo?: string;
  note_libere?: string;
}

export interface AnalisiBagno {
  tipo_stanza: string;
  dimensione_stimata: string;
  altezza_stimata: string;
  piastrelle_parete_attuali: string;
  pavimento_attuale: string;
  colori_dominanti: string[];
  presenza_doccia: boolean;
  tipo_doccia?: string;
  presenza_vasca: boolean;
  presenza_mobile: boolean;
  tipo_mobile?: string;
  sanitari_tipo?: string;
  rubinetteria_attuale?: string;
  illuminazione_attuale?: string;
  stato_conservazione: "buono" | "discreto" | "da_ristrutturare";
  note?: string;
}
