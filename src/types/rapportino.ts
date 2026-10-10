/**
 * Tipi per i Rapportini Digitali (MP4)
 */

import type { FaseLavorataRapportino } from "@/lib/campo/rapportinoFasi";

export type RapportinoStato = "bozza" | "inviato" | "approvato" | "rifiutato";

export interface MaterialeUsato {
  nome: string;
  quantita: number;
  unita: string;
  da_furgone: boolean;
  scorta_id?: string;
  /** Articolo della commessa dichiarato; non implica scarico di magazzino. */
  order_item_id?: string;
  /** Explicit SKU used; no stock movement or extra financial charge is implied. */
  stock_item_id?: string;
  /** La fase (order_work_phases.id) su cui è stato usato; assente = materiale generale. */
  fase_id?: string;
}

export interface CampoRapportino {
  id: string;
  company_id: string;
  order_id: string | null;
  user_id: string;
  role_type: "employee" | "subcontractor";
  data_lavoro: string; // "yyyy-MM-dd"
  ore_lavorate: number;
  ore_straordinario: number;
  descrizione_lavori: string | null;
  materiali_usati: MaterialeUsato[] | null;
  foto_urls: string[] | null;
  /** Fasi su cui si è lavorato, con avanzamento e le foto di ognuna (vedi lib/campo/rapportinoFasi.ts). */
  fasi_lavorate?: FaseLavorataRapportino[] | null;
  lavoro_completato: boolean;
  percentuale_avanzamento: number;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy: number | null;
  meteo: string | null;
  firma_cliente_url: string | null;
  firma_cliente_nome: string | null;
  firma_cliente_at: string | null;
  firma_operaio_url: string | null;
  stato: RapportinoStato;
  pdf_url: string | null;
  approvato: boolean;
  approvato_da: string | null;
  approvato_at: string | null;
  motivo_rifiuto: string | null;
  created_at: string;
  // join
  autore?: { first_name: string; last_name: string } | null;
}

export interface CampoRapportinoInsert {
  company_id: string;
  order_id?: string | null;
  user_id: string;
  role_type: "employee" | "subcontractor";
  data_lavoro: string;
  ore_lavorate: number;
  ore_straordinario?: number;
  descrizione_lavori?: string | null;
  materiali_usati?: MaterialeUsato[] | null;
  foto_urls?: string[] | null;
  lavoro_completato?: boolean;
  percentuale_avanzamento?: number;
  gps_lat?: number | null;
  gps_lng?: number | null;
  gps_accuracy?: number | null;
  meteo?: string | null;
  firma_cliente_url?: string | null;
  firma_cliente_nome?: string | null;
  firma_cliente_at?: string | null;
  firma_operaio_url?: string | null;
  stato?: RapportinoStato;
}
