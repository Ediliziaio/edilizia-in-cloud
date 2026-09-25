import { describe, it, expect } from "vitest";
import { DEFAULT_PERMISSIONS, ROLE_PRESETS } from "@/components/users/permissionsDefaults";
import {
  STAFF_PERMISSION_DEFAULTS,
  STAFF_ROLE_PRESETS,
  buildStaffPermissionsRecord,
} from "../../../supabase/functions/_shared/staffPermissionsDefaults";

/**
 * Contratto edge↔client (2026-07-12): le edge create-* inseriscono
 * staff_permissions con il record COMPLETO (prima: whitelist di ~16 chiavi che
 * scartava il granulare in silenzio). Questo test tiene allineate le chiavi
 * tra i default dell'edge e DEFAULT_PERMISSIONS del client: se si aggiunge un
 * permesso da una parte sola, il test diventa rosso.
 */
describe("staff_permissions: parità edge ↔ client", () => {
  it("le chiavi dei default edge coincidono con DEFAULT_PERMISSIONS", () => {
    const edgeKeys = Object.keys(STAFF_PERMISSION_DEFAULTS).sort();
    const clientKeys = Object.keys(DEFAULT_PERMISSIONS).sort();
    expect(edgeKeys).toEqual(clientKeys);
  });

  it("anche i valori dei default edge coincidono con DEFAULT_PERMISSIONS", () => {
    // Stesse chiavi ma valori diversi = un utente creato dal client nasce
    // diverso da uno creato dall'edge (era il caso di can_view_formazione).
    expect(STAFF_PERMISSION_DEFAULTS).toEqual(DEFAULT_PERMISSIONS);
  });

  it("i preset per ruolo del server sono quelli del client (25/09/2026)", () => {
    // Chi riceve un accesso da una funzione del server (company-access-manage)
    // nasce col preset del suo ruolo, lo stesso della creazione dall'app.
    expect(STAFF_ROLE_PRESETS).toEqual(ROLE_PRESETS);
    // Il venditore, di serie, solo Marketing & Vendita.
    for (const k of ["can_view_orders", "can_view_calendar", "can_view_dashboard", "can_view_customers", "can_view_users"]) {
      expect(STAFF_ROLE_PRESETS.salesperson[k], k).toBeUndefined();
    }
  });

  it("i valori rispecchiano i default DB (niente cambi per chi non passa permissions)", () => {
    // In DB tutto false tranne formazione e importi di vendita
    expect(STAFF_PERMISSION_DEFAULTS.can_view_formazione).toBe(true);
    expect(STAFF_PERMISSION_DEFAULTS.can_view_order_amounts).toBe(true);
    expect(STAFF_PERMISSION_DEFAULTS.only_assigned).toBe(false);
    expect(STAFF_PERMISSION_DEFAULTS.visible_areas).toEqual([]);
    const trueKeys = Object.entries(STAFF_PERMISSION_DEFAULTS)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    expect(trueKeys.sort()).toEqual(["can_view_formazione", "can_view_order_amounts"]);
  });

  it("buildStaffPermissionsRecord: merge solo chiavi note, ignora spazzatura", () => {
    const record = buildStaffPermissionsRecord("user-1", "company-1", {
      can_view_preventivi: true,
      can_view_team_tasks: true,
      can_view_order_amounts: false,
      visible_areas: ["commerciale", 42 as unknown as string],
      // chiavi che NON devono passare
      id: "evil",
      user_id: "evil",
      company_id: "evil",
      created_at: "evil",
      must_change_password: false,
      chiave_inventata: true,
      can_view_orders: "true" as unknown as boolean, // non-boolean → ignorato
    });
    expect(record.user_id).toBe("user-1");
    expect(record.company_id).toBe("company-1");
    expect(record.can_view_preventivi).toBe(true);
    expect(record.can_view_team_tasks).toBe(true);
    expect(record.can_view_order_amounts).toBe(false);
    expect(record.visible_areas).toEqual(["commerciale"]);
    expect(record.can_view_orders).toBe(false);
    expect("id" in record).toBe(false);
    expect("created_at" in record).toBe(false);
    expect("must_change_password" in record).toBe(false);
    expect("chiave_inventata" in record).toBe(false);
  });

  it("buildStaffPermissionsRecord: pipeline_visibili passa solo con id veri (uuid[] in DB)", () => {
    const id = "193b7839-f388-4b50-ae05-e53717067d33";
    const record = buildStaffPermissionsRecord("u", "c", {
      pipeline_visibili: [id, "Nutrimento", 7 as unknown as string, ""],
    });
    expect(record.pipeline_visibili).toEqual([id]);
    expect(buildStaffPermissionsRecord("u", "c").pipeline_visibili).toEqual([]);
  });

  it("senza payload restituisce i puri default (+ user/company)", () => {
    const record = buildStaffPermissionsRecord("u", "c");
    expect(Object.keys(record).length).toBe(Object.keys(STAFF_PERMISSION_DEFAULTS).length + 2);
    expect(record.can_view_dashboard).toBe(false);
  });
});
