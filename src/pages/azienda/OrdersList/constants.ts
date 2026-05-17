/**
 * OrdersList — constants
 * Estratto da OrdersList.tsx (MP-CAN-001).
 */
import type { ImportField } from "@/components/shared/CSVImportDialog";
import type { OrderWithDetails } from "@/types/orders";

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export const ORDER_IMPORT_FIELDS: ImportField[] = [
  { key: "order_code", label: "Codice Commessa", required: false },
  { key: "customer_email", label: "Email Cliente", required: true, type: "email" },
  { key: "description", label: "Descrizione", required: true },
  { key: "total_amount", label: "Importo Totale", required: true, type: "number" },
  { key: "deposit_amount", label: "Acconto 1", required: false, type: "number" },
  { key: "deposit_2_amount", label: "Acconto 2", required: false, type: "number" },
  { key: "balance_amount", label: "Saldo", required: false, type: "number" },
  { key: "expected_date", label: "Data Prevista", required: false, type: "date" },
  { key: "warehouse_arrival_date", label: "Data Magazzino", required: false, type: "date" },
  { key: "work_start_date", label: "Data Inizio Lavori", required: false, type: "date" },
  { key: "internal_notes", label: "Note Interne", required: false },
  { key: "payment_type", label: "Tipo Pagamento", required: false },
];

/**
 * Filtro `or(...)` per pagamenti pendenti: acconti/saldo/financing
 * con importo > 0 ma non ancora pagati.
 * Usato in `useOrdersList` quando l'utente filtra "Solo pagamenti pendenti".
 */
export const PENDING_PAYMENTS_FILTER =
  "and(deposit_amount.gt.0,deposit_paid.eq.false),and(deposit_2_amount.gt.0,deposit_2_paid.eq.false),and(balance_amount.gt.0,balance_paid.eq.false),and(financing_amount.gt.0,financing_paid.eq.false)";

/**
 * Reference stabile per array vuoto orders. Evita di creare un nuovo
 * `[]` ad ogni render, che invaliderebbe le dipendenze di useMemo.
 */
export const EMPTY_ORDERS: OrderWithDetails[] = [];
