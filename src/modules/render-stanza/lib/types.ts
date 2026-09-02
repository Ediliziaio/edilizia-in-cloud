export type TipoStanza = "cucina" | "soggiorno" | "camera_da_letto" | "bagno" | "studio" | "ingresso" | "taverna" | "sala_da_pranzo" | "corridoio" | "altro";

export type StileTarget = "moderno" | "scandinavo" | "industriale" | "classico" | "rustico" | "minimalista" | "mediterraneo" | "art_deco" | "giapponese" | "provenzale" | "eclettico" | "luxe_contemporaneo";

export type IntensitaTrasformazione = "leggero" | "medio" | "radicale";

export interface ConfigVerniciatura {
  attivo: boolean;
  colore_hex?: string;
  colore_nome?: string;
  finitura?: "opaco" | "satinato" | "lucido" | "lavabile";
  applica_a?: "tutte" | "parete_principale" | "parete_accento" | "specifiche";
  colore_accento_hex?: string;
  colore_accento_nome?: string;
}

export interface ConfigPavimentoStanza {
  attivo: boolean;
  tipo?: string;
  colore_hex?: string;
  colore_nome?: string;
  pattern?: string;
  finitura?: string;
  dimensione?: string;
  effetto_visivo?: string;
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

export interface ConfigArredo {
  attivo: boolean;
  stile?: string;
  colore_principale_hex?: string;
  materiale?: "legno_chiaro" | "legno_scuro" | "metallo" | "vetro" | "tessuto" | "pelle";
  intensita_cambio?: "colore_sola" | "stile_mantenendo_layout" | "arredo_completo";
  mantieni_elettrodomestici?: boolean;
}

export interface ConfigSoffitto {
  attivo: boolean;
  colore_hex?: string;
  tipo?: "piano" | "controsoffitto_cartongesso" | "travi_legno" | "boiserie_soffitto";
  colore_travi?: string;
}

export interface ConfigIlluminazione {
  attivo: boolean;
  tipo?: "faretti_incassati" | "lampadario_centrale" | "led_strip_perimetrale" | "lampade_sospensione" | "applique_parete" | "misto";
  temperatura?: "calda_2700k" | "neutra_3000k" | "fredda_4000k";
  intensita_luce?: "soffusa" | "normale" | "forte";
}

export interface ConfigCartaDaParati {
  attivo: boolean;
  stile_pattern?: "geometrico" | "floreale" | "tropicale" | "astratto" | "righe" | "damasco" | "toile_de_jouy" | "botanico" | "minimal";
  colore_base?: string;
  applica_a?: "parete_principale" | "tutte";
  descrizione?: string;
}

export interface ConfigRivestimentoPareti {
  attivo: boolean;
  tipo?: "boiserie_legno" | "mattone_vista" | "pietra_naturale" | "pannelli_3d" | "intonaco_spatolato" | "stucco_veneziano";
  colore_hex?: string;
  applica_a?: "parete_principale" | "tutte";
}

export interface ConfigTende {
  attivo: boolean;
  tipo?: "tende_a_pannello" | "tende_classiche" | "veneziane" | "rullo" | "tende_lino" | "tende_velluto" | "nessuna";
  colore_hex?: string;
  colore_nome?: string;
}

export interface ConfigRestylingCucina {
  attivo: boolean;
  colore_frontali_hex?: string;
  materiale_frontali?: "laccato" | "legno" | "effetto_legno" | "vetro" | "metallo";
  colore_piano_lavoro_hex?: string;
  piano_lavoro_materiale?: "marmo" | "granito" | "quarzo" | "laminato" | "legno";
  maniglie?: "senza_maniglia" | "metallo_nero" | "metallo_oro" | "legno" | "cromato";
  cambia_piano_cottura?: boolean;
}

export interface ConfigSpaziDettagli {
  attivo: boolean;
  layout_strategy?: "mantieni_layout" | "ottimizza_spazio" | "aggiungi_arredo_leggero" | "declutter";
  elementi_da_mantenere?: string;
  elementi_da_aggiungere?: string;
  elementi_da_rimuovere?: string;
  note_tecniche?: string;
}

export interface ConfigurazioneStanza {
  tipo_stanza: TipoStanza;
  stile_target: StileTarget;
  intensita: IntensitaTrasformazione;
  verniciatura: ConfigVerniciatura;
  pavimento: ConfigPavimentoStanza;
  arredo: ConfigArredo;
  soffitto: ConfigSoffitto;
  illuminazione: ConfigIlluminazione;
  carta_da_parati: ConfigCartaDaParati;
  rivestimento_pareti: ConfigRivestimentoPareti;
  tende: ConfigTende;
  restyling_cucina?: ConfigRestylingCucina;
  spazi_dettagli?: ConfigSpaziDettagli;
  note_libere?: string;
  /** Foto prodotto del catalogo render dell'azienda scelte nel wizard (max 4). */
  catalogo_reference_ids?: string[];
}

export interface AnalisiStanza {
  tipo_stanza: string;
  dimensione_stimata: string;
  stile_attuale: string;
  pavimento_attuale: string;
  pareti_attuali: string;
  colori_dominanti: string[];
  illuminazione_attuale: string;
  arredo_presente: string[];
  stato_conservazione: string;
  note?: string;
}
