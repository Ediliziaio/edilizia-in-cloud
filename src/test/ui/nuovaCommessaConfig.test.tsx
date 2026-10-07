// src/test/ui/nuovaCommessaConfig.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  modelli: [] as unknown[],
  modelloFasi: null as string | null,
  controlli: ["indirizzo", "date", "fasi", "chi", "pagamenti"] as string[],
  salva: vi.fn(),
}));
vi.mock("@/hooks/useModelliFasi", () => ({ useModelliFasi: () => ({ modelli: state.modelli }) }));
vi.mock("@/hooks/useImpostazioniAvvio", () => ({
  useImpostazioniAvvio: () => ({
    modelloFasi: state.modelloFasi, controlli: state.controlli, isLoading: false, salva: { mutate: state.salva },
  }),
}));

import NuovaCommessaConfig from "@/components/settings/NuovaCommessaConfig";

const modello = (id: string, nome: string, origine: "azienda" | "partenza" = "azienda") => ({ id, origine, nome, descrizione: "", fasi: [] as unknown[] });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    modelli: [modello("m1", "Ristrutturazione completa"), modello("m2", "Solo bagno"), modello("partenza:tetto", "Tetto", "partenza")],
    modelloFasi: null,
    controlli: ["indirizzo", "date", "fasi", "chi", "pagamenti"],
  });
});
afterEach(cleanup);

describe("Quando apri una commessa", () => {
  it("di partenza: nessuna fase di partenza e tutto da controllare", () => {
    render(<NuovaCommessaConfig puoModificare />);
    expect(screen.getByRole("combobox", { name: "Fasi di partenza" })).toHaveTextContent("Nessuna: le scelgo io");
    for (const nome of ["Indirizzo del cantiere", "Date di inizio e di fine lavori", "Fasi di lavoro", "Chi lavora in cantiere", "Come si paga"]) {
      expect(screen.getByRole("checkbox", { name: nome })).toBeChecked();
    }
  });

  it("scegliere un modello lo salva con il suo id; i modelli di partenza non ancora dell'azienda non si offrono", () => {
    render(<NuovaCommessaConfig puoModificare />);
    fireEvent.click(screen.getByRole("combobox", { name: "Fasi di partenza" }));
    expect(screen.queryByText("Tetto")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Solo bagno"));
    expect(state.salva).toHaveBeenCalledWith({ modelloFasi: "m2" });
  });

  it("«Nessuna» toglie il modello di partenza", () => {
    state.modelloFasi = "m1";
    render(<NuovaCommessaConfig puoModificare />);
    expect(screen.getByRole("combobox", { name: "Fasi di partenza" })).toHaveTextContent("Ristrutturazione completa");
    fireEvent.click(screen.getByRole("combobox", { name: "Fasi di partenza" }));
    fireEvent.click(screen.getByText("Nessuna: le scelgo io, commessa per commessa"));
    expect(state.salva).toHaveBeenCalledWith({ modelloFasi: null });
  });

  it("togliere un controllo salva l'elenco senza quello, nell'ordine di sempre", () => {
    render(<NuovaCommessaConfig puoModificare />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Come si paga" }));
    expect(state.salva).toHaveBeenCalledWith({ controlli: ["indirizzo", "date", "fasi", "chi"] });
  });

  it("rimettere un controllo lo mette al suo posto, non in fondo", () => {
    state.controlli = ["fasi"];
    render(<NuovaCommessaConfig puoModificare />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Indirizzo del cantiere" }));
    expect(state.salva).toHaveBeenCalledWith({ controlli: ["indirizzo", "fasi"] });
  });

  it("chi non può modificare le impostazioni vede le scelte ma non le cambia", () => {
    render(<NuovaCommessaConfig puoModificare={false} />);
    expect(screen.getByRole("combobox", { name: "Fasi di partenza" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Come si paga" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Come si paga" }));
    expect(state.salva).not.toHaveBeenCalled();
  });
});
