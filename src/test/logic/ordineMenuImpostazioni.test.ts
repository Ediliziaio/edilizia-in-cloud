import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSettingsGroups } from "@/lib/impostazioni/navigazioneImpostazioni";
import type { Permissions } from "@/hooks/usePermissions";
import type { StatoPiano } from "@/lib/impostazioni/pianoImpostazioni";

const piano: StatoPiano = { tuttoVisibile: true, pianoLimitato: false, moduloIncluso: () => true, livelloFunzione: () => "enabled" };
const permissions = { isAdmin: true, isLoading: false } as Permissions;

describe("Ordine delle sezioni nelle impostazioni", () => {
  it.each([false, true])("Azienda è seguita da Persone e sicurezza (mobile: %s)", (mobile) => {
    const gruppi = buildSettingsGroups(true, permissions, piano, mobile);
    expect(gruppi.slice(0, 3).map((g) => g.label)).toEqual(["Il mio account", "Azienda", "Persone e sicurezza"]);
    expect(gruppi.flatMap((g) => g.items).filter((v) => v.to === "/azienda/impostazioni/persone")).toHaveLength(1);
  });
  it.each([
    "src/components/layouts/CompanyLayout.tsx",
    "src/pages/azienda/settings/SettingsMobileHub.tsx",
  ])("%s usa la stessa classificazione delle voci", (file) => {
    expect(readFileSync(file, "utf8")).toContain("buildSettingsGroups");
  });
});
