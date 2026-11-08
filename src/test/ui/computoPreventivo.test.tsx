import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { chiaveBozzaComputo } from "@/lib/computo/editorNativo";
import ComputoPreventivo from "@/pages/azienda/marketing/ComputoPreventivo";
// La pagina legge il modello del computo dell'azienda: qui non c'è, e si parte coi valori di serie.
// Le condizioni dall'archivio (07/11/2026): qui un'azienda che non ne ha.
vi.mock("@/hooks/useCondizioniArchivio", () => ({ useCondizioniArchivio: () => ({ modelli: [] as unknown[], inCaricamento: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: false, canViewMargins: false }) }));
vi.mock("@/lib/computo/modelloComputo", async (orig) => ({ ...(await orig<typeof import("@/lib/computo/modelloComputo")>()), useModelloComputo: () => ({ isLoading: false, data: undefined as undefined }) }));

const stato = vi.hoisted(() => ({ company: "c1", user: "u1" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: stato.user }, effectiveCompany: { id: stato.company, name: "Impresa di prova" } }) }));
vi.mock("@/components/computo/ComputoNativoEditor", () => ({ default: ({ storageKey, onBack }: { storageKey: string; onBack: () => void }) =>
  <><output data-testid="storage-key">{storageKey}</output><button onClick={onBack}>Torna ai Preventivi</button></> }));
const ID = "22222222-2222-4222-8222-222222222222";
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
beforeEach(() => { localStorage.clear(); stato.company = "c1"; stato.user = "u1"; });

describe("computo nel flusso Preventivi", () => {
  it("mantiene l'identità della bozza nell'URL e non richiede una commessa", () => {
    render(<MemoryRouter initialEntries={[`/azienda/marketing/preventivi/computo?bozza=${ID}`]}><ComputoPreventivo /><Location /></MemoryRouter>);
    expect(screen.getByTestId("storage-key")).toHaveTextContent(chiaveBozzaComputo("c1", "u1", `preventivo:${ID}`));
    fireEvent.click(screen.getByRole("button", { name: "Torna ai Preventivi" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/azienda/marketing/preventivi");
  });
  it("assegna un identificativo al nuovo preventivo locale", () => {
    render(<MemoryRouter initialEntries={["/azienda/marketing/preventivi/computo"]}><ComputoPreventivo /><Location /></MemoryRouter>);
    expect(screen.getByTestId("location").textContent).toMatch(/bozza=[0-9a-f-]{36}/);
  });
  it("nella versione pubblicata un'azienda non riconosciuta non apre l'editor, anche con URL diretto", () => {
    vi.stubEnv("DEV", false);
    try {
      render(<MemoryRouter initialEntries={[`/azienda/marketing/preventivi/computo?bozza=${ID}`]}><ComputoPreventivo /></MemoryRouter>);
      expect(screen.getByRole("alert")).toHaveTextContent("Azienda non riconosciuta");
      expect(screen.queryByTestId("storage-key")).not.toBeInTheDocument();
    } finally { vi.unstubAllEnvs(); }
  });
});
