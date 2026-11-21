import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bozzaVuota, chiaveBozzaComputo } from "@/lib/computo/editorNativo";
import ComputoPreventivo from "@/pages/azienda/marketing/ComputoPreventivo";
// La pagina legge il modello del computo dell'azienda: qui non c'è, e si parte coi valori di serie.
// Le condizioni dall'archivio (07/11/2026): qui un'azienda che non ne ha.
vi.mock("@/hooks/useCondizioniArchivio", () => ({ useCondizioniArchivio: () => ({ modelli: [] as unknown[], inCaricamento: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: false, canViewMargins: false }) }));
vi.mock("@/lib/computo/modelloComputo", async (orig) => ({ ...(await orig<typeof import("@/lib/computo/modelloComputo")>()), useModelloComputo: () => ({ isLoading: stato.modelloInCaricamento, data: undefined as undefined }) }));

const stato = vi.hoisted(() => ({ company: "c1", user: "u1", modelloInCaricamento: false, leggi: vi.fn(), allegati: vi.fn(), daTabella: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: stato.user }, effectiveCompany: { id: stato.company, name: "Impresa di prova" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: stato.daTabella } }));
vi.mock("@/lib/computo/cloudComputo", async (orig) => ({
  ...(await orig<typeof import("@/lib/computo/cloudComputo")>()),
  leggiComputoCloud: stato.leggi,
  preparaAllegatiCloud: stato.allegati,
  improntaComputo: async (bozza: unknown) => JSON.stringify(bozza),
}));
vi.mock("@/components/computo/CollegamentiComputoNativo", () => ({ CollegamentiComputoNativo: () => <p>Collegamenti del computo</p> }));
vi.mock("@/components/computo/ComputoNativoEditor", () => ({ default: ({ storageKey, onBack }: { storageKey: string; onBack: () => void }) =>
  <><output data-testid="storage-key">{storageKey}</output><button onClick={onBack}>Torna ai Preventivi</button></> }));
const ID = "22222222-2222-4222-8222-222222222222";
const AZIENDA = "66666666-6666-4666-8666-666666666666";
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
beforeEach(() => {
  localStorage.clear();
  stato.company = "c1";
  stato.user = "u1";
  stato.modelloInCaricamento = false;
  stato.leggi.mockReset().mockResolvedValue(null);
  stato.allegati.mockReset().mockResolvedValue(undefined);
  stato.daTabella.mockReset();
});

describe("computo nel flusso Preventivi", () => {
  it("mantiene l'identità della bozza nell'URL e non richiede una commessa", () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[`/azienda/marketing/preventivi/computo?bozza=${ID}`]}><ComputoPreventivo /><Location /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByTestId("storage-key")).toHaveTextContent(chiaveBozzaComputo("c1", "u1", `preventivo:${ID}`));
    fireEvent.click(screen.getByRole("button", { name: "Torna ai Preventivi" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/azienda/marketing/preventivi");
  });
  it("assegna un identificativo al nuovo preventivo locale", () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/azienda/marketing/preventivi/computo"]}><ComputoPreventivo /><Location /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByTestId("location").textContent).toMatch(/bozza=[0-9a-f-]{36}/);
  });
  it("nella versione pubblicata un'azienda non riconosciuta non apre l'editor, anche con URL diretto", () => {
    vi.stubEnv("DEV", false);
    try {
      render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[`/azienda/marketing/preventivi/computo?bozza=${ID}`]}><ComputoPreventivo /></MemoryRouter></QueryClientProvider>);
      expect(screen.getByRole("alert")).toHaveTextContent("Azienda non riconosciuta");
      expect(screen.queryByTestId("storage-key")).not.toBeInTheDocument();
    } finally { vi.unstubAllEnvs(); }
  });
  it("legge il computo esistente una volta sola mentre arriva il modello e apre l'editor quando entrambi sono pronti", async () => {
    stato.company = AZIENDA;
    stato.modelloInCaricamento = true;
    const bozza = bozzaVuota();
    stato.leggi.mockResolvedValue({ id: ID, revision: 2, bozza, updatedAt: "2026-11-21T08:00:00Z" });
    const client = new QueryClient();
    const pagina = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/azienda/marketing/preventivi/computo?bozza=${ID}&esistente=1`]}><ComputoPreventivo /></MemoryRouter></QueryClientProvider>;
    const vista = render(pagina());
    await waitFor(() => expect(stato.allegati).toHaveBeenCalled());
    expect(stato.leggi).toHaveBeenCalledExactlyOnceWith(AZIENDA, ID);
    expect(stato.daTabella).not.toHaveBeenCalled();
    expect(screen.queryByTestId("storage-key")).not.toBeInTheDocument();

    stato.modelloInCaricamento = false;
    vista.rerender(pagina());
    expect(await screen.findByTestId("storage-key")).toHaveTextContent(chiaveBozzaComputo(AZIENDA, "u1", `preventivo:${ID}`));
    expect(stato.leggi).toHaveBeenCalledTimes(1);
  });
  it("per un computo collegato mancante ferma il caricamento con un errore e lascia intatta la copia locale", async () => {
    stato.company = AZIENDA;
    const chiave = chiaveBozzaComputo(AZIENDA, "u1", `preventivo:${ID}`);
    localStorage.setItem(chiave, JSON.stringify(bozzaVuota()));
    const copia = localStorage.getItem(chiave);
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[`/azienda/marketing/preventivi/computo?bozza=${ID}&esistente=1`]}><ComputoPreventivo /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByRole("alert")).toHaveTextContent("Il computo collegato non è più disponibile");
    expect(screen.getByRole("button", { name: "Riprova" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("storage-key")).not.toBeInTheDocument();
    expect(screen.queryByText("Collegamenti del computo")).not.toBeInTheDocument();
    expect(localStorage.getItem(chiave)).toBe(copia);
  });
});
