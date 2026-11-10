import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LegacyPlanimetrieRedirect } from "@/routes/company/LegacyPlanimetrieRedirect";
import { macroAreas } from "@/lib/sidebarConfig";

function Destinazione() {
  const location = useLocation();
  return <p>{location.pathname}{location.search}{location.hash}</p>;
}

describe("Planimetrie autonoma, link esistenti conservati", () => {
  it.each([
    ["", ""],
    ["/nuova?da=disegno", "/nuova?da=disegno"],
    ["/p1?livello=p2&ambito=progetto%3AA&esporta=fascicolo#galleria", "/p1?livello=p2&ambito=progetto%3AA&esporta=fascicolo#galleria"],
    ["/p1/modifica", "/p1/modifica"],
    ["/p1/stanza/locale%201?livello=pt&ambito=fatto&materiali_ambito=progetto%3AA", "/p1/stanza/locale%201?livello=pt&ambito=fatto&materiali_ambito=progetto%3AA"],
  ])("riapre il vecchio indirizzo %s nella nuova sezione", (oldSuffix, newSuffix) => {
    render(<MemoryRouter initialEntries={[`/azienda/render/planimetrie${oldSuffix}`]}><Routes>
      <Route path="/azienda/render/planimetrie/*" element={<LegacyPlanimetrieRedirect />} />
      <Route path="/azienda/planimetrie/*" element={<Destinazione />} />
    </Routes></MemoryRouter>);
    expect(screen.getByText(`/azienda/planimetrie${newSuffix}`)).toBeInTheDocument();
  });

  it("offre due ingressi unici in Progettazione con gli stessi permessi di prima", () => {
    const area = macroAreas.find((item) => item.id === "area_marketing");
    const start = area?.items.findIndex((item) => item.groupLabel === "Progettazione") ?? -1;
    expect(start).toBeGreaterThanOrEqual(0);
    expect(area?.items.slice(start).map((item) => item.url)).toEqual(["/azienda/planimetrie", "/azienda/render"]);
    for (const url of ["/azienda/planimetrie", "/azienda/render"]) {
      const items = macroAreas.flatMap((item) => item.items).filter((item) => item.url === url);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ permissionKey: "canViewRenderAi", featureKey: "render_ai" });
    }
  });
});
