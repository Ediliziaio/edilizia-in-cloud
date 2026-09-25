import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { BgnModuleTemplatePanel } from "@/components/bagni/BgnModuleTemplatePanel";
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "qa" }));
vi.mock("@/hooks/useBagniProgetto", () => ({ useBgnTemplatePdf: () => ({ data: { company_id: "qa", id: "online" }, isLoading: false }) }));
vi.mock("@/lib/moduli-vendita/localBgnTemplates", () => ({ loadLocalBgnTemplate: () : null => null, saveLocalBgnTemplate: vi.fn() }));
vi.mock("@/components/bagni/BagniTemplateEditor", () => ({
  BagniTemplateEditor: ({ localModule }: { localModule: { onDirtyChange: (v: boolean) => void } }) => {
    useEffect(() => { localModule.onDirtyChange(true); }, [localModule.onDirtyChange]);
    return <button>Pagina interna</button>;
  },
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function RouteState() { return <output data-testid="location">{useLocation().search}</output>; }
function mount() { render(<MemoryRouter initialEntries={["/?modulo=bagni&modello=completo&section=page_cover"]}><BgnModuleTemplatePanel moduleId="completo" /><RouteState /></MemoryRouter>); }
describe("Uscita dal modulo locale", () => {
  it("usa una conferma accessibile senza bloccare il browser", () => {
    const native = vi.spyOn(window, "confirm");
    mount();
    fireEvent.click(screen.getByRole("button", { name: "← Moduli Bagni" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(native).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Resta nel modulo" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toContain("modello=completo");
  });
  it("esce solo dopo conferma, senza ripresentare il dialogo", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "← Moduli Bagni" }));
    fireEvent.click(screen.getByRole("button", { name: "Esci senza salvare" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toBe("?modulo=bagni");
  });
  it("consente la navigazione interna e conserva l'accesso alla bozza precedente", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Pagina interna" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apri la bozza precedente" }));
    fireEvent.click(screen.getByRole("button", { name: "Esci senza salvare" }));
    expect(screen.getByTestId("location").textContent).toContain("modello=completo&edizione=precedente");
  });
});
