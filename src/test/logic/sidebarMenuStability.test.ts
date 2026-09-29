import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { macroAreas, type NavItem } from "@/lib/sidebarConfig";

const companyLayoutSource = readFileSync("src/components/layouts/CompanyLayout.tsx", "utf8");

const allItems: NavItem[] = macroAreas.flatMap((area) => area.items);
const assistenza = allItems.find((item) => item.url === "/azienda/assistenza");

describe("company sidebar menu stability", () => {
  it("does not clip expanded macro-area rows with height animations", () => {
    expect(companyLayoutSource).not.toContain("animate-sidebar-slide-down");
    expect(companyLayoutSource).not.toContain("animate-sidebar-slide-up");
  });
});

describe("Assistenza sparisce quando il modulo tickets non è incluso", () => {
  it("la voce Assistenza è marcata hideWhenLocked sul modulo tickets", () => {
    // Sul piano Marketing (included_modules vuoto) tickets non è incluso: la voce
    // deve sparire, non comparire come teaser DEMO. Il flag è la sorgente di verità.
    expect(assistenza).toBeDefined();
    expect(assistenza?.moduleKey).toBe("tickets");
    expect(assistenza?.hideWhenLocked).toBe(true);
  });

  it("filterNavItems nasconde le voci hideWhenLocked col modulo non incluso, tranne sulla Demo", () => {
    // La logica vive in un useCallback inline in CompanyLayout: verifichiamo che la
    // guardia esista e che l'eccezione Demo Azienda + il gate sul modulo siano cablati.
    // `item.hideWhenLocked` compare due volte (prima in isDemoItem, poi nel filtro):
    // lastIndexOf prende la guardia del filtro, che porta le condizioni sul modulo.
    const start = companyLayoutSource.lastIndexOf("item.hideWhenLocked");
    const guard = companyLayoutSource.slice(start, start + 300);
    expect(guard).toContain("item.hideWhenLocked");
    expect(guard).toContain("!isModuleEnabled(item.moduleKey)");
    expect(guard).toContain("!isDemoBaseline");
    // isDemoItem non deve mai marcare DEMO una voce hideWhenLocked.
    expect(companyLayoutSource).toContain("if (item.hideWhenLocked) return false;");
  });
});
