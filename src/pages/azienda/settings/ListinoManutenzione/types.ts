/**
 * Listino Manutenzione — types.
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 */

export interface TipoImpianto {
  id: string;
  company_id: string;
  nome: string;
  icona: string | null;
  ordine: number | null;
  attivo: boolean;
}

/**
 * Allineato al CHECK constraint DB (migration 20260814000001_listino_prezzi.sql):
 *   categoria IN ('manutenzione_ordinaria','manutenzione_straordinaria',
 *                  'guasto','installazione','sopralluogo').
 * DEFAULT DB = 'manutenzione_ordinaria'.
 */
export type CategoriaIntervento =
  | "manutenzione_ordinaria"
  | "manutenzione_straordinaria"
  | "guasto"
  | "installazione"
  | "sopralluogo";

export interface TipoIntervento {
  id: string;
  company_id: string;
  nome: string;
  categoria: CategoriaIntervento | null;
  durata_stimata_h: number | null;
  attivo: boolean;
}

export interface ListinoPrezzo {
  id: string;
  company_id: string;
  tipo_impianto_id: string;
  tipo_intervento_id: string;
  /** Nome DB reale: migration 20260814000001 usa `prezzo_base NUMERIC(10,2)`. */
  prezzo_base: number;
  /** Nome DB reale: `iva_percentuale INTEGER CHECK IN (0,4,10,22)`. */
  iva_percentuale: number;
  /** CHECK DB: unita IN ('intervento','ora','mq','ml','pz'). */
  unita: string;
  /** Permette di disattivare una riga senza cancellarla. DEFAULT true. */
  attivo: boolean;
  /** Note libere (opzionale). */
  note: string | null;
  /** Finestra di validità (opzionale): se valorizzata, il prezzo è attivo solo nel range. */
  valido_dal: string | null;
  valido_al: string | null;
  tipo_impianto?: TipoImpianto;
  tipo_intervento?: TipoIntervento;
}

export type PresetListinoId =
  | "termoidraulica" | "elettrico" | "bagno" | "fotovoltaico"
  | "pittura" | "tetti_ripasso" | "tetti_rifacimento" | "scavi" | "piscine";

export interface ImpiantoSeed {
  nome: string;
  icona: string;
  ordine: number;
  presets: PresetListinoId[];
}

export interface InterventoSeed {
  nome: string;
  categoria: CategoriaIntervento;
  durata_stimata_h: number;
  presets: PresetListinoId[];
}

export interface TariffaListinoSeed {
  impianto: string;
  intervento: string;
  prezzo: number;
  unita: string;
  iva_pct: number;
  presets: PresetListinoId[];
}
