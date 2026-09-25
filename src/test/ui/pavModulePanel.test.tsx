import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PavModuleTemplatePanel } from "@/components/pavimenti/PavModuleTemplatePanel";
import { loadLocalPavTemplate, localPavTemplateKey } from "@/lib/moduli-vendita/localPavTemplates";
const calls = vi.hoisted(() => ({ remote: vi.fn(() => { throw new Error("Remote access forbidden"); }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-a" }));
vi.mock("@/hooks/usePavimentiProgetto", () => ({ usePavTemplatePdf: calls.remote }));
vi.mock("@/components/pavimenti/PavimentiTemplateEditor", () => ({
  PavimentiTemplateEditor: ({ localModule }: { localModule: { id: string; template: any; onDirtyChange: (dirty: boolean) => void; save: (t: any) => void } }) => {
    useEffect(() => { localModule.onDirtyChange(false); }, [localModule.onDirtyChange]);
    return <div><p>{localModule.template.cover_title}</p><button onClick={() => localModule.onDirtyChange(true)}>Modifica prova</button><button onClick={() => localModule.save({ ...localModule.template, cover_title: "Titolo salvato" })}>Salva prova</button></div>;
  },
}));
const Location = () => <output data-testid="location">{useLocation().search}</output>;
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function mount() { return render(<MemoryRouter initialEntries={["/?tipo=pavimenti&modello=resina"]}><PavModuleTemplatePanel moduleId="resina" /><Location /></MemoryRouter>); }
describe("Pavimenti local workspace", () => {
  it("creates from source, saves locally and restores without a remote template", () => {
    const view = mount();
    fireEvent.click(screen.getByText("Salva prova"));
    expect(loadLocalPavTemplate("company-a", "resina")!.template.cover_title).toBe("Titolo salvato");
    view.unmount();
    mount();
    expect(screen.getByText("Titolo salvato")).toBeInTheDocument();
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("keeps a corrupt saved record untouched and exposes the error", () => {
    localStorage.setItem(localPavTemplateKey("company-a", "resina"), "{bad");
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("danneggiata");
    expect(screen.queryByText("Salva prova")).toBeNull();
    expect(localStorage.getItem(localPavTemplateKey("company-a", "resina"))).toBe("{bad");
  });
  it("guards leaving an unsaved draft and resumes the selected navigation", () => {
    mount();
    fireEvent.click(screen.getByText("Modifica prova"));
    fireEvent.click(screen.getByText("← Moduli Pavimenti"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("modello=resina");
    fireEvent.click(screen.getByText("Esci senza salvare"));
    expect(screen.getByTestId("location")).not.toHaveTextContent("modello=resina");
  });
  it("leaves a fresh unchanged source module without confirmation", () => {
    mount();
    fireEvent.click(screen.getByText("← Moduli Pavimenti"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).not.toHaveTextContent("modello=resina");
    expect(loadLocalPavTemplate("company-a", "resina")).toBeNull();
  });
});
