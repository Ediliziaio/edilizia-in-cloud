import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSION_SECTIONS,
  DEFAULT_PERMISSIONS,
  OPERATIONAL_EDIT_PAIRS,
  ROLE_PRESETS,
  SOLA_LETTURA_BLOCKED_KEYS,
  buildStaffPermissionsUpdate,
  MARKETING_SECTIONS,
  PERSONE_SECTIONS,
  syncLegacyMarketingFlags,
  syncLegacySettingsFlags,
} from "@/components/users/permissionsDefaults";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";

describe("permission defaults", () => {
  it("revoca il flag legacy impostazioni quando tutti i granulari sono spenti", () => {
    const permissions: StaffPermissions = {
      ...DEFAULT_PERMISSIONS,
      can_view_settings: true,
      can_edit_settings: true,
      can_view_settings_people: false,
      can_edit_settings_people: false,
      can_view_settings_security: false,
    };

    expect(syncLegacySettingsFlags(permissions)).toMatchObject({
      can_view_settings: false,
      can_edit_settings: false,
    });
  });

  it("revoca il flag legacy marketing quando tutti i granulari sono spenti", () => {
    const permissions: StaffPermissions = {
      ...DEFAULT_PERMISSIONS,
      can_view_marketing: true,
      can_edit_marketing: true,
      can_view_marketing_contacts: false,
      can_edit_marketing_contacts: false,
      can_view_sales_os: false,
      can_view_sms_marketing: false,
    };

    expect(syncLegacyMarketingFlags(permissions)).toMatchObject({
      can_view_marketing: false,
      can_edit_marketing: false,
    });
  });

  it("mantiene attivo il flag marketing se SMS o Sales OS sono gli unici granulari attivi", () => {
    expect(syncLegacyMarketingFlags({
      ...DEFAULT_PERMISSIONS,
      can_view_sms_marketing: true,
    }).can_view_marketing).toBe(true);

    expect(syncLegacyMarketingFlags({
      ...DEFAULT_PERMISSIONS,
      can_view_sales_os: true,
    }).can_view_marketing).toBe(true);
  });

  it("non espone permessi duplicati o legacy morti nei gruppi principali", () => {
    const keys = ALL_PERMISSION_SECTIONS.map((section) => section.viewKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(MARKETING_SECTIONS.some((section) => section.label === "Preventivi CRM")).toBe(false);
    expect(PERSONE_SECTIONS.some((section) => section.viewKey === "can_view_messaggi_esterni")).toBe(false);
  });

  describe("buildStaffPermissionsUpdate: la modifica segue la visibilità (come il trigger)", () => {
    it("modifica operativa = visibilità quando non è in sola lettura", () => {
      const payload = buildStaffPermissionsUpdate({
        ...DEFAULT_PERMISSIONS,
        can_view_orders: true,
        can_edit_orders: false,
        can_view_marketing_contacts: true,
        can_view_customers: false,
        can_edit_customers: true,
      });
      expect(payload.can_edit_orders).toBe(true);
      expect(payload.can_edit_marketing_contacts).toBe(true);
      expect(payload.can_edit_marketing).toBe(true);
      expect(payload.can_edit_customers).toBe(false);
    });

    it("sola lettura spegne modifica operativa, impostazioni e azioni speciali", () => {
      const tuttoAcceso = Object.fromEntries(
        Object.entries(DEFAULT_PERMISSIONS).map(([k, v]) => [k, typeof v === "boolean" ? true : v]),
      ) as unknown as StaffPermissions;
      const payload = buildStaffPermissionsUpdate({ ...tuttoAcceso, sola_lettura: true });
      for (const [viewKey, editKey] of OPERATIONAL_EDIT_PAIRS) {
        expect(payload[viewKey], viewKey).toBe(true);
        expect(payload[editKey], editKey).toBe(false);
      }
      for (const key of SOLA_LETTURA_BLOCKED_KEYS) expect(payload[key], key).toBe(false);
      expect(payload.can_edit_marketing).toBe(false);
      expect(payload.can_edit_settings).toBe(false);
      // Le visibilità delle impostazioni restano
      expect(payload.can_view_settings_profile).toBe(true);
    });

    it("i preset ruolo non contraddicono la derivazione", () => {
      for (const [role, preset] of Object.entries(ROLE_PRESETS)) {
        const payload = buildStaffPermissionsUpdate({ ...DEFAULT_PERMISSIONS, ...preset });
        for (const [, editKey] of OPERATIONAL_EDIT_PAIRS) {
          if (editKey in preset) {
            expect(payload[editKey], `${role}.${editKey}`).toBe(preset[editKey]);
          }
        }
      }
    });
  });
});
