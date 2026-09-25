import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InterventionTextPicker } from "@/components/preventivi/modules/InterventionTextPicker";
import { ImportaCondizioniBar } from "@/components/quote-templates/ImportaCondizioniBar";
const calls = vi.hoisted(() => ({ invoke: vi.fn(), upload: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: calls.invoke }, storage: { from: () => ({ upload: calls.upload }) } } }));
vi.mock("sonner", () => ({ toast: { error: calls.error, success: calls.success } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("strumenti dei moduli locali", () => {
  it("mostra il testo prima di applicare soltanto la sezione scelta", () => {
    const apply = vi.fn();
    render(<InterventionTextPicker title="Ripasso" onApply={apply} choices={[
      { id: "cover", section: "Copertina", label: "Essenziale", preview: "Ripasso del tetto", patch: { cover_title: "Ripasso" } },
      { id: "needs", section: "Esigenze", label: "Tecnica", preview: "Verificare il manto", patch: { esigenze: [{ titolo: "Verificare il manto" }] } },
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "Testi per questo modulo" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "needs" } });
    expect(screen.getByLabelText("Anteprima del testo")).toHaveTextContent("Verificare il manto");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Applica a esigenze" }));
    expect(apply).toHaveBeenCalledWith({ esigenze: [{ titolo: "Verificare il manto" }] });
  });
  it("importa il testo localmente senza caricarlo o invocare l'AI", async () => {
    const apply = vi.fn();
    const { container } = render(<ImportaCondizioniBar companyId="company-a" testoAttuale="" onTesto={apply} localOnly soloImport />);
    const file = new File(["Condizioni approvate"], "condizioni.md", { type: "text/markdown" });
    Object.defineProperty(file, "text", { value: async () => "Condizioni approvate" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(apply).toHaveBeenCalledWith("Condizioni approvate"));
    expect(calls.upload).not.toHaveBeenCalled();
    expect(calls.invoke).not.toHaveBeenCalled();
  });
  it("rifiuta PDF nell'import locale senza ripiegare sull'upload remoto", async () => {
    const apply = vi.fn();
    const { container } = render(<ImportaCondizioniBar companyId="company-a" testoAttuale="" onTesto={apply} localOnly soloImport />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["pdf"], "condizioni.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(calls.error).toHaveBeenCalled());
    expect(apply).not.toHaveBeenCalled();
    expect(calls.upload).not.toHaveBeenCalled();
    expect(calls.invoke).not.toHaveBeenCalled();
  });
});
