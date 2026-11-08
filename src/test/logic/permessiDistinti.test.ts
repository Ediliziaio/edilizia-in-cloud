import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS, applyEditFollowsView, buildStaffPermissionsUpdate, sezioniConPermessiDistinti, CANTIERI_SECTIONS } from "@/components/users/permissionsDefaults";

describe("Visualizzazione e modifica distinte", () => {
  it("conserva la modalità corrente fino alla scelta esplicita", () => {
    expect(applyEditFollowsView({ ...DEFAULT_PERMISSIONS, can_view_orders: true }).can_edit_orders).toBe(true);
  });
  it("consente rapportini senza concedere modifica di commesse e anagrafiche operai", () => {
    const p = buildStaffPermissionsUpdate({ ...DEFAULT_PERMISSIONS, permessi_dettagliati: true, can_view_orders: true, can_edit_orders: false, can_view_operai: true, can_edit_operai: false, can_view_giornale_lavori: true, can_edit_giornale_lavori: true });
    expect(p.can_edit_orders).toBe(false); expect(p.can_edit_operai).toBe(false); expect(p.can_edit_giornale_lavori).toBe(true);
    expect(sezioniConPermessiDistinti(CANTIERI_SECTIONS, p).find(s => s.viewKey === "can_view_orders")?.editKey).toBe("can_edit_orders");
  });
  it("non abilita modifiche senza visualizzazione e la sola lettura prevale", () => {
    const p = applyEditFollowsView({ ...DEFAULT_PERMISSIONS, permessi_dettagliati: true, can_edit_orders: true, can_view_giornale_lavori: true, can_edit_giornale_lavori: true, sola_lettura: true });
    expect(p.can_edit_orders).toBe(false); expect(p.can_edit_giornale_lavori).toBe(false);
  });
});
