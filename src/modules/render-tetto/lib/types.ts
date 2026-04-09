export type TipoManto = "tegole_coppi" | "tegole_marsigliesi" | "tegole_portoghesi" | "tegole_piane" | "ardesia_naturale" | "ardesia_sintetica" | "lamiera_grecata" | "lamiera_aggraffata" | "lamiera_zinco_titanio" | "guaina_bituminosa" | "guaina_tpo" | "tegole_fotovoltaiche";

export type FinituraMantoTetto = "opaco" | "semi_lucido" | "lucido";

export type MaterialeGrondaia = "alluminio" | "rame" | "acciaio_zincato" | "pvc" | "zinco_titanio";

export type TipoLucernario = "piatto" | "sporgente" | "abbaino";

export interface ConfigManto {
  tipo: TipoManto;
  colore_hex: string;
  colore_nome?: string;
  finitura: FinituraMantoTetto;
}

export interface ConfigGrondaie {
  attivo: boolean;
  materiale: MaterialeGrondaia;
  colore_hex: string;
  colore_pluviale_hex?: string;
}

export interface ConfigLucernari {
  attivo: boolean;
  azione: "mantieni" | "aggiungi" | "rimuovi";
  tipo?: TipoLucernario;
  quantita?: 1 | 2 | 3 | 4;
  posizione?: "centrale" | "laterale_sx" | "laterale_dx" | "distribuiti";
  colore_telaio_hex?: string;
}

export interface ConfigPannelliSolari {
  attivo: boolean;
  tipo?: "fotovoltaico_nero" | "fotovoltaico_blu" | "tegola_solare_integrata";
  quantita?: "pochi" | "medi" | "tanti";
  posizione?: "falda_sud" | "falda_principale" | "distribuiti";
}

export interface ConfigurazioneTetto {
  manto: ConfigManto;
  grondaie: ConfigGrondaie;
  lucernari: ConfigLucernari;
  pannelli_solari?: ConfigPannelliSolari;
  note_libere?: string;
}

export interface AnalisiTetto {
  tipo_tetto: string;
  numero_falde: number;
  manto_attuale: string;
  colore_manto_hex: string;
  presenza_lucernari: boolean;
  numero_lucernari: number;
  pendenza_stimata: number;
  presenza_comignoli: boolean;
  stato_conservazione: string;
}
