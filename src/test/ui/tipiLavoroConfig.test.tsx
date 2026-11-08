// src/test/ui/tipiLavoroConfig.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settore: "serramenti" as string | null,
  tipiLavoro: null as string[] | null,
  misureRegola: {} as Record<string, string>,
  salva: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1", sector: state.settore } }) }));
vi.mock("@/hooks/useImpostazioniAvvio", () => ({
  useImpostazioniAvvio: () => ({ tipiLavoro: state.tipiLavoro, modelloFasi: null as string | null, controlli: [] as string[], misureRegola: state.misureRegola, isLoading: false, salva: { mutate: state.salva, isPending: false } }),
}));

import TipiLavoroConfig from "@/components/settings/TipiLavoroConfig";

beforeEach(() => { vi.clearAllMocks(); Object.assign(state, { settore: "serramenti", tipiLavoro: null, misureRegola: {} }); });
afterEach(cleanup);

describe("I lavori che facciamo", () => {
  it("senza scelta parte dal settore e lo dice", () => {
    render(<TipiLavoroConfig puoModificare />);
    expect(screen.getByRole("checkbox", { name: "Serramenti e infissi" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Fotovoltaico" })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("dal settore");
  });
  it("aggiungere un lavoro salva la scelta completa", () => {
    render(<TipiLavoroConfig puoModificare />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Bagni" }));
    expect(state.salva).toHaveBeenCalledWith({ tipiLavoro: ["serramenti", "bagno"] });
  });
  it("togliere l'ultimo lavoro torna al settore", () => {
    state.tipiLavoro = ["bagno"];
    render(<TipiLavoroConfig puoModificare />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Bagni" }));
    expect(state.salva).toHaveBeenCalledWith({ tipiLavoro: null });
  });
  it("un'azienda «altro» senza scelta vede tutto, e glielo si dice", () => {
    state.settore = "altro";
    render(<TipiLavoroConfig puoModificare />);
    expect(screen.getByRole("checkbox", { name: "Bagni" })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("tutti i modelli");
  });
  it("i serramenti aspettano il sopralluogo, e la scelta si salva per tipo di lavoro", () => {
    render(<TipiLavoroConfig puoModificare />);
    const regola = screen.getByRole("checkbox", { name: "Sopralluogo per Serramenti e infissi" });
    expect(regola).toBeChecked();
    fireEvent.click(regola);
    expect(state.salva).toHaveBeenCalledWith({ misureRegola: { serramenti: "definitive" } });
  });
  it("chi non può modificare vede ma non cambia", () => {
    render(<TipiLavoroConfig puoModificare={false} />);
    expect(screen.getByRole("checkbox", { name: "Bagni" })).toBeDisabled();
  });
});
