/**
 * Tipi TypeScript per il modulo SMS Marketing — solo SuperAdmin.
 * Contiene campi wholesale e margini — mai esposti al frontend azienda.
 */

/** Configurazione prezzi globale (solo SuperAdmin) */
export interface SmsPricingConfig {
  readonly id: string;
  prezzo_numero_mensile: number;
  prezzo_per_sms: number;
  costo_wholesale_sms: number;
  soglia_crediti_minima: number;
  soglia_crediti_blocco: number;
  crediti_bonus_primo_acquisto: number;
  attivo: boolean;
  updated_at: string;
}

/** Riga per tabella SuperAdmin (un tenant) */
export interface SmsTenantRow {
  company_id: string;
  company_name: string;
  numero_e164: string | null;
  numero_stato: string | null;
  crediti_wallet: number;
  sms_mese: number;
  fatturato_mese: number;
  costo_wholesale_mese: number;
  margine_mese: number;
  margine_percentuale: number;
}

/** Statistiche P&L per periodo */
export interface SmsSuperAdminStats {
  periodo: string;
  fatturato_totale: number;
  costo_wholesale_totale: number;
  margine_totale: number;
  margine_percentuale: number;
  tenant_attivi: number;
  sms_totali: number;
  trend: SmsPLTrendPoint[];
}

/** Punto dati per il grafico P&L */
export interface SmsPLTrendPoint {
  mese: string;
  fatturato: number;
  costo_wholesale: number;
  margine: number;
}
