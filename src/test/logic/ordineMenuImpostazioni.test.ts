import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Ordine delle sezioni nelle impostazioni", () => {
  it.each([
    "src/components/layouts/CompanyLayout.tsx",
    "src/pages/azienda/settings/SettingsMobileHub.tsx",
  ])("mette Persone & Accessi subito dopo La mia azienda in %s", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("buildSettingsGroups");
    const menu = readFileSync("src/lib/impostazioni/navigazioneImpostazioni.tsx", "utf8");
    const azienda = menu.indexOf('label: "La mia azienda"');
    const dopoAzienda = menu.slice(azienda + 'label: "La mia azienda"'.length);
    const nextGroup = dopoAzienda.match(/\n {4}label: "([^"]+)"|\n {6}label: "([^"]+)"/);

    expect(azienda).toBeGreaterThan(-1);
    expect(nextGroup?.[1] ?? nextGroup?.[2]).toBe("Persone & Accessi");
    expect(menu.match(/to: "\/azienda\/impostazioni\/persone"/g)).toHaveLength(1);
  });
});
