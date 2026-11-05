import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ImpreseEdili, { impreseFaq } from "@/pages/per/ImpreseCostuzione";
vi.mock("@/components/landing/LandingNavbar", () => ({ default: (): null => null }));
vi.mock("@/components/landing/LandingFooter", () => ({ default: (): null => null }));
vi.mock("@/components/landing/SolutionSection", () => ({ default: (): null => null }));
describe("landing imprese edili", () => {
  it("collega la scelta alla demo e dichiara i dati illustrativi nelle schermate", () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    try {
      act(() => root.render(<MemoryRouter><ImpreseEdili /></MemoryRouter>));
      expect(host.querySelectorAll("h1")).toHaveLength(1);
      expect(host.querySelector('a[href="/demo/"]')).not.toBeNull();
      expect(host.querySelector('a[href="/blog/migliori-software-gestionali-edilizia-confronto/"]')).not.toBeNull();
      expect(host.querySelectorAll("figure")).toHaveLength(2);
      for (const figure of host.querySelectorAll("figure")) expect(figure.textContent).toMatch(/demo|dimostrativa/);
      expect(host.querySelectorAll("details")).toHaveLength(impreseFaq.length);
      const schema = document.querySelector("#jsonld-faq-imprese-edili");
      expect(JSON.parse(schema!.textContent!).mainEntity.map((q: {name: string}) => q.name)).toEqual(impreseFaq.map(f=>f.q));
    } finally { act(() => root.unmount()); host.remove(); }
  });
});
