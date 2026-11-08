import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InterventionTextPicker } from "@/components/preventivi/modules/InterventionTextPicker";
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
});
