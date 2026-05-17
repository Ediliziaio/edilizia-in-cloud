/**
 * SicurezzaCantiere — types
 * Estratto da SicurezzaCantiere.tsx (MP-CAN-001 Fase 3).
 *
 * NOTA LEGALE: questi tipi descrivono documenti POS/DUVRI conformi al
 * D.Lgs 81/08 (Testo Unico Sicurezza). Non modificare i campi senza
 * review tecnico-legale. Solo refactor strutturale, no cambio shape.
 */

export type OrderOption = {
  id: string;
  description: string | null;
  order_code: string | null;
};

export type RelatedOrder = Pick<OrderOption, "description" | "order_code">;

export type RiskItem = {
  rischio?: string;
  livello?: string;
  misura_prevenzione?: string;
};

export type DpiItem = string | {
  mansione?: string;
  dpi?: string | string[];
};

export type InterferenceItem = {
  rischio?: string;
  misura?: string;
  misura_prevenzione?: string;
  livello_rischio?: string;
  responsabile?: string;
};

export type PosDocument = {
  id: string;
  order_id: string | null;
  orders?: RelatedOrder | null;
  version?: number | string | null;
  created_at: string;
  responsabile_sicurezza?: string | null;
  status: string;
  tipo_lavori?: string | null;
  numero_lavoratori?: number | null;
  rischi_presenti?: RiskItem[] | null;
  dpi_richiesti?: DpiItem[] | null;
  procedure_operative?: string | null;
  generated_content?: string | null;
};

export type DuvriDocument = {
  id: string;
  order_id: string | null;
  orders?: RelatedOrder | null;
  created_at: string;
  status: string;
  committente_nome?: string | null;
  subappaltatori?: unknown[] | null;
  interferenze?: InterferenceItem[] | null;
  costi_sicurezza?: number | null;
  misure_prevenzione?: string | null;
  generated_content?: string | null;
};

export type VerbaleSicurezza = {
  id: string;
  orders?: RelatedOrder | null;
  tipo: string;
  esito: string;
  data?: string | null;
  redatto_da?: string | null;
  note?: string | null;
};

export type SubappaltatoreSicurezza = {
  id: string;
  orders?: RelatedOrder | null;
  ragione_sociale: string;
  tipo_lavori?: string | null;
  responsabile?: string | null;
  durc_scadenza?: string | null;
};

export type AdempimentoSicurezza = {
  id: string;
  titolo: string;
  tipo?: string | null;
  scadenza_data?: string | null;
  stato: string;
  note?: string | null;
};

export type PrintableSafetyDoc = Pick<
  PosDocument | DuvriDocument,
  "id" | "order_id" | "status" | "created_at" | "generated_content"
>;
