// src/test/ui/chiSpuntaConfig.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChiSpuntaConfig from "@/components/settings/ChiSpuntaConfig";

const state = vi.hoisted(() => ({ regola: "tutti", salva: vi.fn() }));
vi.mock("@/hooks/useChiSpunta", () => ({
  useChiSpunta: () => ({ chiSpunta: state.regola, isLoading: false, salva: { mutate: state.salva, isPending: false } }),
}));
beforeEach(() => { vi.clearAllMocks(); state.regola = "tutti"; });
afterEach(cleanup);

describe("ChiSpuntaConfig", () => {
  it("mostra le tre scelte, con quella dell'azienda selezionata", () => {
    state.regola = "chi_la_fa";
    render(<ChiSpuntaConfig puoModificare />);
    expect(screen.getByRole("radio", { name: /Chiunque lavori sulla commessa/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Chi fa quella fase/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Solo il capocantiere/ })).not.toBeChecked();
  });
  it("cambiare scelta salva", () => {
    render(<ChiSpuntaConfig puoModificare />);
    fireEvent.click(screen.getByRole("radio", { name: /Solo il capocantiere/ }));
    expect(state.salva).toHaveBeenCalledWith("capi");
  });
  it("chi non può modificare le vede spente", () => {
    render(<ChiSpuntaConfig puoModificare={false} />);
    expect(screen.getByRole("radio", { name: /Solo il capocantiere/ })).toBeDisabled();
  });
  it("dice che l'ufficio spunta sempre e che la regola vale anche nell'app vecchia", () => {
    render(<ChiSpuntaConfig puoModificare />);
    expect(screen.getByText(/L'ufficio spunta sempre/)).toBeInTheDocument();
  });
});
