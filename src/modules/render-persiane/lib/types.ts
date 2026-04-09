export type TipoOperazione = "sostituisci" | "cambia_colore" | "aggiungi" | "rimuovi";

export type TipoPersiana =
  | "veneziana_classica"
  | "veneziana_esterna"
  | "scuro_pieno"
  | "scuro_cornice"
  | "gelosia"
  | "avvolgibile_esterno"
  | "a_libro"
  | "griglia_sicurezza"
  | "brise_soleil";

export type MaterialePersiana =
  | "legno_naturale"
  | "legno_composito"
  | "alluminio"
  | "pvc"
  | "acciaio"
  | "fibra_vetro";

export type StatoApertura =
  | "chiuso"
  | "socchiuso"
  | "aperto_45"
  | "aperto_90"
  | "anta_singola_aperta";

export type AperturaLamelle = "chiuse" | "parzialmente_aperte" | "completamente_aperte";

export const TIPI_CON_LAMELLE = new Set<TipoPersiana>([
  "veneziana_classica",
  "veneziana_esterna",
  "gelosia",
  "brise_soleil",
]);

export interface ConfigurazionePersiane {
  operazione: TipoOperazione;
  tipo: TipoPersiana;
  materiale: MaterialePersiana;
  colore_mode: "ral" | "legno";
  colore_ral?: string;
  colore_nome?: string;
  colore_hex?: string;
  effetto_legno?: string;
  stato_apertura: StatoApertura;
  lamelle?: {
    larghezza_mm: 40 | 50 | 60 | 80;
    apertura: AperturaLamelle;
  };
  colore_profilo_diverso?: boolean;
  colore_profilo_hex?: string;
  applica_tutte_finestre: boolean;
  note_libere?: string;
}

export interface AnalisiPersiane {
  tipo_facciata: string;
  persiane_attuali: string;
  materiale_attuale: string;
  colore_attuale: string;
  numero_finestre: number;
  stato_conservazione: string;
  note?: string;
}
