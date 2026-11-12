import type { StaffPermissions } from "@/components/users/PermissionsDialog";
import { buildStaffPermissionsUpdate } from "@/components/users/permissionsDefaults";

/** Mirrors the saved permission payload, including legacy edit inheritance. */
export function officeAccessSummary(input: StaffPermissions) {
  const p = buildStaffPermissionsUpdate(input);
  const costs = !!p.can_view_costs || !!p.can_manage_purchasing;
  const amounts = p.can_view_order_amounts !== false;
  const margins = !!p.can_view_margins;
  const payroll = !!p.can_view_employees || !!p.can_view_persone;
  return {
    orders: !!p.can_view_orders,
    editOrders: !!p.can_edit_orders,
    amounts, costs, margins, payroll,
    paymentStatus: amounts || !!p.can_view_order_payment_status,
    individualRates: costs && payroll,
    invoices: !!p.can_view_billing,
    scope: p.only_my_warehouse ? "Magazzini assegnati e proprie" : "Tutte quelle consentite nell’azienda",
    warnings: [
      p.can_manage_purchasing && !p.can_view_costs ? "Gestire gli acquisti concede anche la lettura dei costi." : null,
      amounts && margins && !costs ? "Venduto e margine permettono di ricavare i costi, anche se il dettaglio è nascosto." : null,
      costs && !payroll ? "Il costo del personale è aggregato. Con una sola persona, altri dati già noti possono comunque consentire deduzioni." : null,
      payroll ? "Schede dipendenti e Personale & HR comprendono dati individuali riservati: concedili solo a chi ne ha bisogno." : null,
      p.only_assigned ? "Il portafoglio CRM è limitato ai propri dati. Le commesse dell’ufficio restano visibili secondo i permessi salvati." : null,
    ].filter((x): x is string => x !== null),
  };
}
