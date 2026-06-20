export type AliquotaIva = 0 | 4 | 10 | 22;
export type FonteVoce = "listino" | "prezzario" | "libera";

export interface VoceSim {
  id: string;
  fase_id: string | null;
  descrizione: string;
  fonte: FonteVoce;
  riferimento_id: string | null;
  codice: string | null;
  quantita: number;
  unita: string;
  costo_unitario: number;
  ricarico_pct: number;
  prezzo_unitario: number;
  vat_rate: AliquotaIva;
  bene_significativo: boolean;
  valore_posa_associata: number | null;
  is_manodopera: boolean;
  ordine: number;
}

export interface FaseSim {
  id: string;
  nome: string;
  ordine: number;
  durata_settimane: number;
  inizio_offset_settimane: number;
  giorni_uomo: number;
  note: string | null;
}

export interface FinanziamentoConfig {
  tabella_id: string | null;
  importo_finanziato: number;
  numero_rate: number;
  anticipo: number;
}

export interface ScenariConfig {
  iva_mode: "singola" | "mista";
  iva_rate_singola: 4 | 10 | 22;
  iva_confronto: number[];
  finanziamento: FinanziamentoConfig | null;
}

export interface SimulazioneDoc {
  voci: VoceSim[];
  fasi: FaseSim[];
  scenari: ScenariConfig;
}

export interface RiepilogoIvaRiga { aliquota: number; imponibile: number; imposta: number; }

export interface SimulazioneRisultato {
  costo_totale: number;
  ricavo_imponibile: number;
  margine_valore: number;
  margine_pct: number;
  riepilogo_iva: RiepilogoIvaRiga[];
  iva_totale: number;
  prezzo_cliente: number;
  confronto_iva: { aliquota: number; prezzo_cliente: number }[];
  durata_settimane: number;
  rata_mensile: number | null;
}

export const DEFAULT_SCENARI: ScenariConfig = {
  iva_mode: "singola",
  iva_rate_singola: 10,
  iva_confronto: [4, 10, 22],
  finanziamento: null,
};
