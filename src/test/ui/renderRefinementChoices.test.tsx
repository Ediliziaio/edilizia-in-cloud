import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { RenderResultRefinementPanel } from "@/components/render/RenderResultRefinementPanel";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
describe("riepilogo delle finiture", () => {
  it("mostra solo gli interventi attivi, senza materiali di default disabilitati", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<RenderResultRefinementPanel config={{ intonaco: { attivo: true, colore: "Bianco perla" }, rivestimento: { attivo: false, tipo: "Travertino" }, cappotto: { enabled: false, sistema: "EPS" } }} />));
    expect(container.textContent).toContain("Bianco perla");
    expect(container.textContent).not.toContain("Travertino");
    expect(container.textContent).not.toContain("EPS");
    act(() => root.unmount());
  });
});
