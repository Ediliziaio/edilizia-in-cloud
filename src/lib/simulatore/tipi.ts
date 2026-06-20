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

/**
 * Base di calcolo di una provvigione (commerciale, segnalatore, ecc.):
 * - `ricavo`  → % sul ricavo netto (dopo sconto).
 * - `margine` → % sul margine PRE-provvigioni (ricavo_netto − costo_pieno).
 * - `fisso`   → importo fisso in €.
 */
export type ProvvigioneBase = "ricavo" | "margine" | "fisso";

/** Una provvigione configurata nello scenario (vive nel JSONB `scenari`). */
export interface ProvvigioneSim {
  id: string;
  nome: string;
  base: ProvvigioneBase;
  /** % (per base "ricavo"/"margine") oppure € (per base "fisso"). */
  valore: number;
}

export interface ScenariConfig {
  iva_mode: "singola" | "mista";
  iva_rate_singola: 4 | 10 | 22;
  iva_confronto: number[];
  /** Spese generali in % sul costo diretto (default 0). */
  spese_generali_pct: number;
  /** Utile d'impresa target in % sul costo pieno (default 0). */
  utile_pct: number;
  /** Sconto in % sul ricavo lordo, applicato al cliente (default 0). */
  sconto_pct: number;
  /**
   * Stato Avanzamento Lavori (SAL): ripartizione degli incassi nel tempo.
   * `acconto_pct` pagato all'inizio (settimana 0), `saldo_pct` a fine lavori
   * (ultima settimana); il resto incassato durante i lavori in proporzione
   * all'avanzamento dei costi.
   */
  sal: { acconto_pct: number; saldo_pct: number };
  finanziamento: FinanziamentoConfig | null;
  /**
   * Provvigioni (commerciale, segnalatore, ecc.): costi interni applicati DOPO
   * sconto + spese generali, che erodono il margine finale ma NON il prezzo al
   * cliente. Default `[]`.
   */
  provvigioni: ProvvigioneSim[];
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
  /**
   * margine FINALE (= margine_netto_valore − provvigioni_totale); legacy
   * denormalizzato. Riflette spese generali + sconto + provvigioni.
   */
  margine_valore: number;
  /** margine FINALE % (su ricavo_netto); legacy denormalizzato. */
  margine_pct: number;
  // ── Economia & trattativa ───────────────────────────────────────────────
  /** Somma dei costi delle voci (= costo_totale). */
  costo_diretto: number;
  /** costo_diretto × spese_generali_pct/100. */
  spese_generali: number;
  /** costo_diretto + spese_generali. */
  costo_pieno: number;
  /** ricavo_lordo × sconto_pct/100. */
  sconto_valore: number;
  /** Somma prezzi voci (= ricavo_imponibile, prima dello sconto). */
  ricavo_lordo: number;
  /** ricavo_lordo − sconto_valore (imponibile effettivo al cliente). */
  ricavo_netto: number;
  /** costo_pieno × utile_pct/100 (utile d'impresa atteso). */
  utile_target: number;
  /**
   * margine OPERATIVO = ricavo_netto − costo_pieno (PRE-provvigioni). È il
   * margine prima dei costi di provvigione; usato come base "margine" e mostrato
   * accanto al margine finale per evidenziarne l'impatto.
   */
  margine_netto_valore: number;
  /** margine_netto_valore / ricavo_netto × 100 (0 se ricavo_netto ≤ 0). */
  margine_netto_pct: number;
  /** Somma € di tutte le provvigioni (commerciale, segnalatore, ecc.). */
  provvigioni_totale: number;
  // ── IVA / prezzo / cronoprogramma ───────────────────────────────────────
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
  spese_generali_pct: 0,
  utile_pct: 0,
  sconto_pct: 0,
  sal: { acconto_pct: 30, saldo_pct: 10 },
  finanziamento: null,
  provvigioni: [],
};
