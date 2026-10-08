// src/test/ui/avanzamentoCommessaConfig.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AvanzamentoCommessaConfig from "@/components/settings/AvanzamentoCommessaConfig";

const state = vi.hoisted(() => ({ peso: "uguale", salva: vi.fn() }));
vi.mock("@/hooks/usePesoMediaFasi", () => ({
  usePesoMediaFasi: () => ({ pesoMedia: state.peso, isLoading: false, salva: { mutate: state.salva, isPending: false } }),
}));
beforeEach(() => { vi.clearAllMocks(); state.peso = "uguale"; });
afterEach(cleanup);

describe("AvanzamentoCommessaConfig", () => {
  it("mostra le tre scelte, con quella dell'azienda selezionata", () => {
    state.peso = "durata";
    render(<AvanzamentoCommessaConfig puoModificare />);
    expect(screen.getByRole("radio", { name: /Alla pari/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Per durata/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Per importo venduto/ })).not.toBeChecked();
  });
  it("cambiare scelta salva", () => {
    render(<AvanzamentoCommessaConfig puoModificare />);
    fireEvent.click(screen.getByRole("radio", { name: /Per importo venduto/ }));
    expect(state.salva).toHaveBeenCalledWith("venduto");
  });
  it("chi non può modificare le vede spente", () => {
    render(<AvanzamentoCommessaConfig puoModificare={false} />);
    expect(screen.getByRole("radio", { name: /Per durata/ })).toBeDisabled();
  });
});
