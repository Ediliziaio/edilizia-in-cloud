import { supabase } from "@/integrations/supabase/client";
import { buildInstallmentsFromLegacy, type Installment } from "@/lib/orderUtils";
import { calculateInstallmentCollections } from "@/lib/commissions";
import { agreedContractValue, variantiApprovateDatate } from "@/lib/orders/contractValue";
import { incassiDellaCommessa } from "@/lib/orders/incassiCommessa";
import { rateDaIncassare } from "@/lib/orders/saldoFinale";
import { leggiModalitaCommesse } from "@/lib/finanziamenti/leggiModalitaCommesse";
import type { ModalitaCostoFinanziaria } from "@/lib/finanziamenti/costoFinanziaria";

export type CommissionContract = Parameters<typeof buildInstallmentsFromLegacy>[0] & {
  id: string; order_code: string | null; description: string | null; created_at: string | null;
  total_amount: number | null; vat_rate: number | null; financing_cost: number | null;
  financing_cost_mode?: ModalitaCostoFinanziaria | null;
  workflow_kind: string | null; parent_contract_id: string | null;
  customer: { first_name: string | null; last_name: string | null } | null;
  status: { name: string | null } | null;
  installments: Installment[];
  variazioni: Parameters<typeof variantiApprovateDatate>[0];
};

const fields = `id,order_code,description,created_at,total_amount,vat_rate,payment_type,financing_cost,workflow_kind,parent_contract_id,
 deposit_amount,deposit_paid,deposit_paid_date,deposit_expected_date,deposit_2_amount,deposit_2_paid,deposit_2_paid_date,deposit_2_expected_date,
 balance_amount,balance_paid,balance_paid_date,balance_expected_date,financing_amount,financing_paid,financing_paid_date,financing_expected_date,
 customer:profiles!orders_customer_id_fkey(first_name,last_name),status:order_statuses!orders_current_status_id_fkey(name),
 installments:order_installments(id,order_id,position,label,type,amount,is_paid,paid_date,expected_date,documento_fiscale_id,fattura:documenti_fiscali(id,numero,stato,importo_pagato)),
 variazioni:ordini_variazione(status,impatto_economico,offline_signed_on,firmato_il,approval_recorded_at,richiesto_il,created_at)`;

export async function loadCommissionContract(companyId: string, orderId: string) {
  async function read(id: string) {
    const { data, error } = await supabase.from("orders").select(fields).eq("company_id", companyId).eq("id", id).is("deleted_at", null).single();
    if (error) throw error;
    const order = data as unknown as CommissionContract;
    if (!order) throw new Error("Commessa non disponibile");
    return (await leggiModalitaCommesse(companyId, [order]))[0];
  }
  const original = await read(orderId);
  // An operational intervention uses its parent contract's payment plan.
  const order = original.workflow_kind === "intervento" && original.parent_contract_id ? await read(original.parent_contract_id) : original;
  return { original, order };
}

export function commissionContractFigures(order: CommissionContract, today: string) {
  const installments = order.installments.length ? [...order.installments].sort((a, b) => a.position - b.position) : buildInstallmentsFromLegacy(order);
  const agreed = agreedContractValue(order.total_amount ?? 0, order.variazioni);
  const varianti = variantiApprovateDatate(order.variazioni);
  const vat = order.vat_rate ?? 22;
  const common = { installments, totalAmount: agreed, vatRate: vat, paymentType: order.payment_type, financingCost: order.financing_cost, financingCostMode: order.financing_cost_mode, varianti };
  const totals = incassiDellaCommessa(common);
  const collected = calculateInstallmentCollections({ ...common, financingCost: totals.costoFinanziaria, includeFinancing: true });
  const paidInvoices = new Map<string, number>();
  installments.forEach(i => { if (i.fattura?.id) paidInvoices.set(i.fattura.id, Number(i.fattura.importo_pagato) || 0); });
  const remaining = rateDaIncassare(installments.map((i, index) => ({ ...i, id: i.id || `legacy-${index}`, order_id: order.id, expected_date: i.expected_date ?? null })), new Map([[order.id, { total_amount: order.total_amount, vat_rate: vat, payment_type: order.payment_type ?? null, financing_cost: order.financing_cost, financing_cost_mode: order.financing_cost_mode, varianti }]]), paidInvoices);
  const rows = installments.map((i, index) => {
    const due = remaining.find(r => r.id === (i.id || `legacy-${index}`))?.amount ?? 0;
    const received = collected[index];
    const status = due + received <= 0.01 ? "Non dovuta" : due <= 0.01 ? "Incassata" : received > 0 ? "Parziale" : i.expected_date && i.expected_date < today && i.type !== "financing" ? "Scaduta" : "Da incassare";
    return { ...i, received, due, status, total: Math.round((received + due) * 100) / 100 };
  });
  return { totals, rows, agreed, vat, unplanned: remaining.filter(r => r.id.endsWith(":non-pianificato")).reduce((sum, r) => sum + r.amount, 0) };
}

