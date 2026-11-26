import { describe, expect, it } from "vitest";
import { macroAreas } from "@/lib/sidebarConfig";
import { voceSidebarAttiva } from "@/lib/sidebarAttiva";

describe("navigazione di cantiere", () => {
  const items = macroAreas.find(area => area.id === "area_cantieri")!.items;
  it("mette Programmazione dopo Clienti e Calendario dopo Magazzino", () => {
    const titoli = items.map(item => item.title);
    expect(titoli.indexOf("Programmazione")).toBe(titoli.indexOf("Clienti") + 1);
    expect(titoli.indexOf("Calendario")).toBe(titoli.indexOf("Magazzino") + 1);
    expect(items.find(item => item.title === "Programmazione")).toMatchObject({
      url: "/azienda/ordini?tab=programmazione", permissionKey: "canViewOrders",
    });
  });
  it("evidenzia la scheda giusta e non confonde le fatture ricevute con l'hub", () => {
    const urls = macroAreas.flatMap(area => area.items.map(item => item.url));
    expect(voceSidebarAttiva("/azienda/ordini?tab=programmazione", "/azienda/ordini", "?tab=programmazione&giorno=2026-11-27", urls)).toBe(true);
    expect(voceSidebarAttiva("/azienda/ordini", "/azienda/ordini", "?tab=programmazione", urls)).toBe(false);
    expect(voceSidebarAttiva("/azienda/ordini", "/azienda/ordini", "?tab=rapportini", urls)).toBe(true);
    expect(voceSidebarAttiva("/azienda/documenti", "/azienda/documenti/fatture-ricevute", "", urls)).toBe(false);
  });
});
