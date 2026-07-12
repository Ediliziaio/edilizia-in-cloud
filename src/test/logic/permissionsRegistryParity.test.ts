import { describe, it, expect } from "vitest";
import {
  DEFAULT_PERMISSIONS,
  ROLE_PRESETS,
  ALL_PERMISSION_SECTIONS,
  TEAM_VISIBILITY_SECTIONS,
} from "@/components/users/permissionsDefaults";
import { STAFF_PERMISSIONS_SELECT_KEYS } from "@/hooks/usePermissions";

/**
 * Contratto master del sistema permessi (audit 2026-07-12).
 * Tre classi di bug reali trovate e fixate che questo test rende impossibili:
 * 1. Toggle "morto": permesso configurabile in dialog ma mai caricato a runtime
 *    (can_view_all_team_calendar, can_approve_orders, can_delete_orders, …).
 * 2. Chiave "fantasma": toggle che non salva perché la chiave manca in
 *    DEFAULT_PERMISSIONS e buildStaffPermissionsUpdate la filtra
 *    (can_approve_discounts / "Approva Sconti").
 * 3. Drift edge↔client (coperto da staffPermissionsEdgeParity.test.ts).
 */
describe("permessi: parità dei registri", () => {
  const defaultKeys = new Set(Object.keys(DEFAULT_PERMISSIONS));

  it("ogni toggle delle dialog esiste in DEFAULT_PERMISSIONS (altrimenti non salva)", () => {
    for (const s of [...ALL_PERMISSION_SECTIONS, ...TEAM_VISIBILITY_SECTIONS]) {
      expect(defaultKeys.has(s.viewKey as string), `viewKey orfana: ${String(s.viewKey)} (${s.label})`).toBe(true);
      if (s.editKey) {
        expect(defaultKeys.has(s.editKey as string), `editKey orfana: ${String(s.editKey)} (${s.label})`).toBe(true);
      }
    }
  });

  it("ogni chiave dei preset ruolo esiste in DEFAULT_PERMISSIONS", () => {
    for (const [role, preset] of Object.entries(ROLE_PRESETS)) {
      for (const key of Object.keys(preset)) {
        expect(defaultKeys.has(key), `preset ${role}: chiave ignota ${key}`).toBe(true);
      }
    }
  });

  it("ogni permesso in DEFAULT_PERMISSIONS è caricato a runtime (niente toggle morti)", () => {
    // Eccezioni documentate:
    // - can_view_messaggi_esterni: feature rimossa (MP-CLEANUP), colonna legacy
    // - can_edit_settings: aggregate legacy usato SOLO dalle RLS server-side
    //   (7 policy), sincronizzato al save da syncLegacySettingsFlags
    const legacyServerOnly = new Set(["can_view_messaggi_esterni", "can_edit_settings"]);
    const selectKeys = new Set<string>(STAFF_PERMISSIONS_SELECT_KEYS);
    for (const key of defaultKeys) {
      if (legacyServerOnly.has(key)) continue;
      expect(selectKeys.has(key), `permesso mai caricato a runtime (toggle morto): ${key}`).toBe(true);
    }
  });

  it("ogni colonna caricata a runtime esiste in DEFAULT_PERMISSIONS (e quindi in DB)", () => {
    for (const key of STAFF_PERMISSIONS_SELECT_KEYS) {
      expect(defaultKeys.has(key), `colonna nel SELECT ma non nei default: ${key}`).toBe(true);
    }
  });
});
