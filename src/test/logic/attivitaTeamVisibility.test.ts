import { describe, it, expect } from "vitest";
import {
  DEFAULT_PERMISSIONS,
  ROLE_PRESETS,
  CANTIERI_SECTIONS,
} from "@/components/users/permissionsDefaults";

/**
 * Contratto "Attività per ruolo" (2026-07-12):
 * la pagina /azienda/attivita è personal-first — ogni utente non-admin vede
 * SOLO le proprie task salvo permesso esplicito can_view_team_tasks.
 * Questi test impediscono di reintrodurre per sbaglio la visione team nei
 * preset ruolo (era il bug: il commerciale vedeva le attività di tutti).
 */
describe("attività: visibilità team", () => {
  it("default: can_view_team_tasks spento", () => {
    expect(DEFAULT_PERMISSIONS.can_view_team_tasks).toBe(false);
  });

  it("nessun preset ruolo accende la visione team (admin è implicito)", () => {
    for (const [roleName, preset] of Object.entries(ROLE_PRESETS)) {
      expect(
        (preset as Record<string, unknown>).can_view_team_tasks ?? false,
        `il preset "${roleName}" non deve vedere le attività del team di default`,
      ).toBe(false);
    }
  });

  it("il toggle è esposto nella dialog permessi (sezione Cantieri)", () => {
    const entry = CANTIERI_SECTIONS.find(s => s.viewKey === "can_view_team_tasks");
    expect(entry).toBeDefined();
    expect(entry?.label).toBe("Attività del team");
  });

  it("il calendario team resta un permesso separato (can_view_all_team_calendar)", () => {
    const entry = CANTIERI_SECTIONS.find(s => s.viewKey === "can_view_all_team_calendar");
    expect(entry).toBeDefined();
    // Il commerciale di default NON vede il calendario del team → suoi appuntamenti
    expect((ROLE_PRESETS.salesperson as Record<string, unknown>).can_view_all_team_calendar ?? false).toBe(false);
    expect((ROLE_PRESETS.call_center as Record<string, unknown>).can_view_all_team_calendar ?? false).toBe(false);
  });
});
