import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/components/admin/RenderAiChiavi", () => ({ RenderAiChiavi: (): null => null }));
import PlatformHealthPage, { ErroriRecenti } from "@/pages/admin/PlatformHealthPage";
afterEach(() => { cleanup(); rpc.mockReset(); });
function open() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    <ErroriRecenti />
  </QueryClientProvider>);
}
describe("Registro salute raggruppato", () => {
  it("mostra conteggio e causa dei blocchi senza confonderli con un guasto tecnico", async () => {
    const base = { avvenuto_il: new Date().toISOString(), primo_evento: new Date().toISOString(), azienda_nome: null as string | null, gravita: "avviso", origine: "cron", componente: "chiamata pianificata" };
    rpc.mockResolvedValue({ data: [
      { ...base, id: "credito", categoria: "azione_richiesta", numero_eventi: 1919, messaggio: "Crediti AI esauriti", codice: 402 },
      { ...base, id: "guasto", categoria: "errore_tecnico", numero_eventi: 3, messaggio: "Servizio non disponibile", codice: 503 },
    ], error: null });
    open();
    expect(await screen.findByText("1919")).toBeInTheDocument();
    expect(screen.getByText("Azione richiesta")).toBeInTheDocument();
    expect(screen.getByText("Errore tecnico")).toBeInTheDocument();
    expect(screen.getByText("Servizio non disponibile")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("admin_errori_raggruppati", { p_ore: 48, p_limit: 100 });
  });
  it("un errore di lettura non diventa 'Nessun errore' e permette di riprovare", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error("DB non raggiungibile") })
      .mockResolvedValue({ data: [], error: null });
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a caricare le segnalazioni");
    expect(screen.queryByText(/Nessun errore registrato/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await waitFor(() => expect(screen.getByText(/Nessun errore registrato/)).toBeInTheDocument());
  });
  it("cerca per codice HTTP e limita l’elenco alla categoria scelta", async () => {
    const dataEvento = "2026-11-21T12:14:00Z";
    const base = { origine: "edge", avvenuto_il: dataEvento, primo_evento: dataEvento, azienda_nome: "Demo", gravita: "avviso", numero_eventi: 1 };
    rpc.mockResolvedValue({ data: [
      { ...base, id: "pagamento", componente: "render-ai", messaggio: "Credito terminato", codice: 402, categoria: "azione_richiesta" },
      { ...base, id: "tecnico", componente: "mail", messaggio: "Connessione interrotta", codice: 503, categoria: "errore_tecnico" },
    ], error: null });
    open();
    expect(await screen.findByText("Connessione interrotta")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo di segnalazione" }), { target: { value: "azione_richiesta" } });
    fireEvent.change(screen.getByRole("searchbox", { name: /Cerca componente/ }), { target: { value: "HTTP 402" } });
    expect(screen.getByText("Credito terminato")).toBeInTheDocument();
    expect(screen.queryByText("Connessione interrotta")).not.toBeInTheDocument();
  });
});

describe("Salute piattaforma", () => {
  it("mostra la sonda fallita e apre direttamente i job da verificare", async () => {
    const now = "2026-11-21T13:00:00Z";
    const job = {
      job: "job-con-errori-ripetuti", attivo: true, schedule: "*/5 * * * *", ultima: now, esecuzioni: 30, falliti: 4,
      ultimo_esito: "succeeded", ultimo_errore: "Errore di prova",
    };
    rpc.mockResolvedValue({ data: {
      riepilogo: {
        job_totali: 2, job_attivi: 2, job_con_errori: 1, job_singhiozzi: 0, errori_edge_24h: 2, funzioni_strumentate: 30, funzioni_totali_stimate: 100,
        disponibilita_24h_pct: 99.8, aziende_attive_24h: 4, trial_scaduti_da_gestire: 0, insoluti_aperti: 0, aziende_cancellate_in_attesa: 0,
        segreti_cron_in_chiaro: 0,
      },
      job: [job, { ...job, job: "job-regolare", falliti: 0, ultimo_errore: null }],
      job_falliti: [{ ...job, guasto: true }],
      funzioni: [],
      battito: { stato: { ultimo_esito: "fallito", ultimo_controllo: now, ultima_durata_ms: null, falliti_di_fila: 1, controlli_24h: 720, falliti_24h: 1 }, interruzioni: [] },
      calcolato_il: now,
    }, error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/admin/salute"]}>
      <PlatformHealthPage />
    </MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "Ultimo controllo fallito" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Panoramica", selected: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apri job" }));
    expect(screen.getByRole("tab", { name: "Job", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Stato dei job" })).toHaveValue("guasti");
    expect(screen.getByText("job-con-errori-ripetuti")).toBeInTheDocument();
    expect(screen.queryByText("job-regolare")).not.toBeInTheDocument();
  });
});
