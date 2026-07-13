import { describe, expect, it } from "vitest";
import { ALL_PERMISSION_SECTIONS, TEAM_VISIBILITY_SECTIONS } from "@/components/users/permissionsDefaults";
import { PERMISSION_CATEGORIES } from "@/components/users/UserRolesPermissionsTab";

/**
 * Parità tra le superfici permessi (13/7/2026).
 *
 * Il registro condiviso (ALL_PERMISSION_SECTIONS) alimenta PermissionsDialog e
 * CreateUserWizard; UserRolesPermissionsTab (modifica utente da Persone &
 * Accessi) ha invece una lista propria con raggruppamenti e descrizioni ricche.
 * Storia: il tab era rimasto indietro di 10 permessi (granularità Listino,
 * team, scadenzario, tesoreria) → toggle impostabili in creazione ma
 * invisibili in modifica. Questo test impedisce nuove divergenze: ogni chiave
 * del registro DEVE essere regolabile anche nel tab.
 */
describe("parità superfici permessi (dialog/wizard ↔ tab modifica)", () => {
  const registryKeys = new Set<string>();
  ALL_PERMISSION_SECTIONS.forEach((s) => {
    registryKeys.add(s.viewKey);
    if (s.editKey) registryKeys.add(s.editKey);
  });

  const tabKeys = new Set<string>();
  PERMISSION_CATEGORIES.forEach((c) =>
    c.modules.forEach((m) => {
      tabKeys.add(m.viewKey);
      if (m.editKey) tabKeys.add(m.editKey);
    }),
  );
  // I toggle team sono renderizzati nel tab come blocco dedicato (non moduli)
  TEAM_VISIBILITY_SECTIONS.forEach((s) => tabKeys.add(s.viewKey));

  it("ogni permesso del registro è regolabile anche nel tab di modifica", () => {
    const missing = [...registryKeys].filter((k) => !tabKeys.has(k)).sort();
    expect(missing).toEqual([]);
  });

  it("il tab non inventa permessi fuori dal registro", () => {
    const extra = [...tabKeys].filter((k) => !registryKeys.has(k)).sort();
    expect(extra).toEqual([]);
  });
});
