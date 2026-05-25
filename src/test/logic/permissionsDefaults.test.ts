import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSION_SECTIONS,
  DEFAULT_PERMISSIONS,
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
});
