import type { ExpectedSupplierPayment } from "@/lib/forecastTypes";

type StoredNumber = number | string | null;

/** Importi nella convenzione delle righe esistenti: qui non si applica IVA
 * presunta e non si creano costi, scadenze o pagamenti ufficiali. */
export interface SupplierPaymentSource {
  purchase_price?: StoredNumber;
  quantity?: StoredNumber;
  payment_method?: string | null;
  deposit_amount?: StoredNumber;
  balance_amount?: StoredNumber;
  deposit_expected_date?: string | null;
  balance_expected_date?: string | null;
  deposit_paid?: boolean | null;
  balance_paid?: boolean | null;
  is_paid?: boolean | null;
}

export interface SupplierInstallment {
  kind: "deposit" | "balance" | "single";
  amount: number;
  expectedDate: string | null;
  isPaid: boolean;
}

const missing = (value: StoredNumber | undefined) => value == null || value === "";
function amount(value: StoredNumber | undefined, fallback: number, field: string): number {
  const n = missing(value) ? fallback : Number(value);
  if (!Number.isFinite(n) || n < 0) throw new RangeError(`Importo fornitore non valido: ${field}`);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Acconto e saldo esistono contemporaneamente; ciascuno mantiene il proprio
 * stato e la propria data. Zero esplicito è diverso da importo mancante. */
export function supplierPaymentSchedule(item: SupplierPaymentSource): SupplierInstallment[] {
  // Il prezzo unitario può avere più di due decimali; arrotondare soltanto
  // l'importo esteso, altrimenti grandi quantità cambiano il totale.
  const price = missing(item.purchase_price) ? 0 : Number(item.purchase_price);
  if (!Number.isFinite(price) || price < 0) throw new RangeError("Costo unitario fornitore non valido");
  const qty = missing(item.quantity) ? 1 : Number(item.quantity);
  if (!Number.isFinite(qty) || qty < 0) throw new RangeError("Quantità fornitore non valida");
  const total = amount(price * qty, 0, "total");
  const split = item.payment_method === "50_50" || item.payment_method === "30_70";
  if (!split) return [{ kind: "single", amount: total,
    expectedDate: item.balance_expected_date || item.deposit_expected_date || null,
    isPaid: !!item.is_paid }];

  const deposit = amount(item.deposit_amount, total * (item.payment_method === "50_50" ? 0.5 : 0.3), "deposit_amount");
  // Un saldo memorizzato resta autorevole anche se include condizioni diverse.
  // Se manca, ricavarlo dal totale; mai un residuo negativo inventato.
  const balance = amount(item.balance_amount, total - deposit, "balance_amount");
  return [
    { kind: "deposit", amount: deposit, expectedDate: item.deposit_expected_date || null,
      isPaid: !!item.is_paid || !!item.deposit_paid },
    { kind: "balance", amount: balance, expectedDate: item.balance_expected_date || null,
      isPaid: !!item.is_paid || !!item.balance_paid },
  ];
}

export interface SupplierForecastSource extends SupplierPaymentSource {
  id: string;
  supplier?: { name?: string | null } | null;
  order: { id: string; order_code?: string | null };
}

/** La copertura proviene dalla vista esistente: un articolo già a costo non
 * genera anche la stessa uscita stimata. Le allocazioni parziali richiedono
 * l'estensione del modello descritta nella specifica, non una dedup per nome. */
export function expectedSupplierPayments(
  items: readonly SupplierForecastSource[], alreadyCosted: ReadonlySet<string>,
): ExpectedSupplierPayment[] {
  const labels = { deposit: "Acconto Fornitore", balance: "Saldo Fornitore", single: "Pagamento Fornitore" } as const;
  return items.flatMap(item => alreadyCosted.has(item.id) ? [] : supplierPaymentSchedule(item)
    .filter(p => !p.isPaid && p.amount > 0)
    .map(p => ({
      orderItemId: item.id, orderId: item.order.id, orderCode: item.order.order_code || null,
      supplierName: item.supplier?.name || "Fornitore sconosciuto", type: labels[p.kind],
      amount: p.amount, expectedDate: p.expectedDate ? new Date(p.expectedDate) : null,
      isPaid: false, direction: "out" as const,
    })))
    .sort((a, b) => !a.expectedDate ? (b.expectedDate ? 1 : 0)
      : !b.expectedDate ? -1 : a.expectedDate.getTime() - b.expectedDate.getTime());
}
