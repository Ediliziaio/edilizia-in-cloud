import { describe, expect, it } from "vitest";
import { mapDbRowToPermissions, senzaScritture, SOLO_LETTURA_PER_RUOLO } from "@/hooks/usePermissions";

// Dipendenti e subappaltatori leggono staff_permissions, ma nel database has_permission e
// has_permission_for_company non danno loro nessun permesso d'ufficio: un «Modifica commesse»
// rimasto nella riga non deve accendere pulsanti che il database rifiuterebbe (14/11/2026).
describe("ruoli senza scritture d'ufficio", () => {
  const riga = { can_view_orders: true, can_edit_orders: true, can_edit_warehouse: true, can_manage_payments: true, can_view_costs: true };

  it("dipendenti e subappaltatori sono nell'elenco, staff e venditori no", () => {
    expect(SOLO_LETTURA_PER_RUOLO).toEqual(expect.arrayContaining(["employee", "subcontractor"]));
    expect(SOLO_LETTURA_PER_RUOLO).not.toContain("company_staff");
    expect(SOLO_LETTURA_PER_RUOLO).not.toContain("salesperson");
  });

  it("spegne le scritture e lascia le letture", () => {
    const p = senzaScritture(mapDbRowToPermissions(riga));
    expect(p.canEditOrders).toBe(false);
    expect(p.canEditWarehouse).toBe(false);
    expect(p.canManagePayments).toBe(false);
    expect(p.canViewOrders).toBe(true);
    expect(p.canViewCosts).toBe(true);
  });

  it("non cambia l'oggetto di partenza", () => {
    const originale = mapDbRowToPermissions(riga);
    senzaScritture(originale);
    expect(originale.canEditOrders).toBe(true);
  });
});
