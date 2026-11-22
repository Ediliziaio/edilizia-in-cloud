import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import CampoSchedaCantiere from "@/pages/campo/CampoSchedaCantiere";
import { CantieriTecniciLink } from "@/components/campo/CantieriTecniciLink";
import { AccessiTecniciCantiere } from "@/components/orders/AccessiTecniciCantiere";
import { changeFormControl } from "@/test/helpers/changeFormControl";
import type { DocumentoSchedaCantiere, FaseSchedaCantiere, SchedaCantiere } from "@/lib/campo/schedaCantiere";
import { syncQueue } from "@/lib/campo/sync-queue";

const stato = vi.hoisted(() => ({
  rpc: vi.fn(), scarica: vi.fn(), accesso: true, salvaRilievi: false, salvaFasi: false, faseRiaperta: false,
  salvati: [] as string[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "impresa" }, user: { id: "utente" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: stato.rpc } }));
vi.mock("@/components/orders/filePreviewUtils", () => ({ ATTACHMENTS_BUCKET: "order-attachments", scaricaAllegato: stato.scarica }));
vi.mock("@/hooks/campo/useCampoWorkDay", () => ({ useCampoWorkDay: () => "2026-11-22" }));
vi.mock("@/hooks/useCalendarioCantiere", () => ({ useCalendarioCantiere: () => ({ lavorativo: () => true }) }));
vi.mock("@/hooks/useCommessaCampoSync", () => ({ useCommessaCampoSync: (): void => undefined }));

const cantiere: SchedaCantiere["cantiere"] = { id: "scuola", titolo: "Scuola via Milano", codice: "C-065", indirizzo: "Via Milano 12",
  inizio: "2026-11-01", fine: "2026-12-01", progresso: 40 };
const fasi: FaseSchedaCantiere[] = [
  { id: "scavi", name: "Scavi", status: "in_corso", percentuale: 40, start_date: "2026-11-04", end_date: "2026-11-20",
    completata_il: null, primo: "2026-11-06", ultimo: "2026-11-20", note: null,
    sottofasi: [{ id: "tracce", name: "Tracciamento", phase_id: "scavi", position: 1, peso: 100, fatta: false,
      fatta_il: null, percentuale: 40, data_inizio: "2026-11-04", data_fine: "2026-11-20" }] },
  { id: "posa", name: "Posa", status: "da_iniziare", percentuale: 0, start_date: "2026-11-24",
    end_date: "2026-11-30", completata_il: null, primo: null, ultimo: null, note: null, sottofasi: [] },
];
const documenti: DocumentoSchedaCantiere[] = [
  { id: "pos", nome: "POS revisionato.pdf", mime: "application/pdf", percorso: "orders/scuola/pos.pdf", categoria: "pos", revisione: "02" },
  { id: "tavola", nome: "Tavola impianti.dwg", mime: null, percorso: "orders/scuola/tavola.dwg", categoria: "tavole", revisione: null },
];

beforeEach(async () => {
  for (const item of await syncQueue.getAll()) await syncQueue.remove(item.id);
  vi.clearAllMocks();
  stato.accesso = true;
  stato.salvaRilievi = false;
  stato.salvaFasi = false;
  stato.faseRiaperta = false;
  stato.salvati = [];
  stato.rpc.mockImplementation((nome: string, args: Record<string, unknown>) => {
    if (nome === "commessa_accesso_tecnico") {
      if (args.p_consentito) stato.salvati = [...stato.salvati, String(args.p_persona)];
      else stato.salvati = stato.salvati.filter(id => id !== args.p_persona);
      return Promise.resolve<{ error: null }>({ error: null });
    }
    if (nome === "commessa_permesso_rilievi") {
      stato.salvaRilievi = Boolean(args.p_consentito);
      return Promise.resolve({ error: null });
    }
    const persone = [
      { id: "capo", nome: "Marco Capo", abilitato: false, ammissibile: true },
      { id: "geometra", nome: "Giulia Rossi", abilitato: stato.salvati.includes("geometra"), ammissibile: true, registra_rilievi: stato.salvaRilievi },
      { id: "sub", nome: "Ditta Esterna", abilitato: false, ammissibile: false },
    ];
    const permessi = { aggiorna_fasi: stato.salvaFasi, registra_rilievi: stato.salvaRilievi };
    const faseResponse = stato.faseRiaperta
      ? fasi.map(fase => fase.id === "posa" ? { ...fase, status: "in_corso", percentuale: 100 } : fase) : fasi;
    const risposta: { data: unknown; error: { code: string } | null } = nome === "commessa_accessi_tecnici" ? { data: persone, error: null }
      : nome === "campo_cantieri_tecnici" ? { data: stato.accesso ? [cantiere] : [], error: null }
      : !stato.accesso ? { data: null, error: { code: "42501" } }
      : nome === "campo_rilievi_cantiere" ? { data: [], error: null }
      : nome === "campo_avanzamenti_cantiere" ? { data: [], error: null }
      : { data: args.p_sezione === "documenti" ? { cantiere, documenti, permessi } : { cantiere, fasi: faseResponse, permessi }, error: null };
    return { abortSignal: async () => risposta };
  });
});

function monta(contenuto: React.ReactNode, url = "/campo") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[url]}>{contenuto}</MemoryRouter></QueryClientProvider>);
}

it("il capocantiere entra dalla Home, apre le sottofasi, il piano con ritardi e scarica dal dossier", async () => {
  monta(<Routes>
    <Route path="/campo" element={<CantieriTecniciLink />} />
    <Route path="/campo/cantieri/:orderId" element={<CampoSchedaCantiere />} />
  </Routes>);
  fireEvent.click(await screen.findByRole("link", { name: "Cantieri da seguire" }));
  expect(await screen.findByRole("heading", { name: "Scuola via Milano" })).toBeInTheDocument();
  const scavi = screen.getByText("Scavi").closest("summary")!;
  fireEvent.click(scavi);
  expect(within(await screen.findByRole("list", { name: "Sottofasi di Scavi" })).getByText("Tracciamento")).toBeVisible();
  expect(screen.getByText("Posa")).toBeInTheDocument();
  expect(stato.rpc).not.toHaveBeenCalledWith("campo_scheda_cantiere", expect.objectContaining({ p_sezione: "documenti" }));

  fireEvent.mouseDown(screen.getByRole("tab", { name: "Cronoprogramma" }), { button: 0 });
  expect(await screen.findByText("2 giorni di ritardo sulla fine")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Solo ritardi" }));
  expect(screen.queryByRole("heading", { name: "Posa" })).not.toBeInTheDocument();

  fireEvent.mouseDown(screen.getByRole("tab", { name: "Documenti" }), { button: 0 });
  expect(await screen.findByText("POS revisionato.pdf")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox", { name: "Cerca documenti" }), { target: { value: "tavola" } });
  expect(screen.queryByText("POS revisionato.pdf")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Scarica Tavola impianti.dwg" }));
  await waitFor(() => expect(stato.scarica).toHaveBeenCalledWith("orders/scuola/tavola.dwg", "Tavola impianti.dwg"));
});

it("un accesso negato da link diretto non mostra dati, lista o azioni sui file", async () => {
  stato.accesso = false;
  monta(<Routes>
    <Route path="/campo/cantieri/:orderId" element={<CampoSchedaCantiere />} />
  </Routes>, "/campo/cantieri/scuola?tab=documenti");
  expect(await screen.findByRole("alert")).toHaveTextContent("La scheda è disponibile per il capocantiere");
  expect(screen.queryByText("Scuola via Milano")).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Documenti" })).not.toBeInTheDocument();
  expect(stato.scarica).not.toHaveBeenCalled();
});

it("l’ufficio abilita un geometra alla consultazione e può revocarla", async () => {
  monta(<AccessiTecniciCantiere orderId="scuola" capo="capo" />);
  const scegli = await screen.findByRole("combobox", { name: "Persona da abilitare" });
  expect(scegli).not.toBeDisabled();
  changeFormControl(scegli, { target: { value: "geometra" } });
  fireEvent.click(screen.getByRole("button", { name: "Abilita consultazione" }));
  const revoca = await screen.findByRole("button", { name: "Revoca accesso di Giulia Rossi" });
  expect(stato.rpc).toHaveBeenCalledWith("commessa_accesso_tecnico", { p_ordine: "scuola", p_persona: "geometra", p_consentito: true });
  const rilievi = screen.getByRole("button", { name: "Registrazione rilievi per Giulia Rossi" });
  expect(rilievi).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(rilievi);
  await waitFor(() => expect(rilievi).toHaveAttribute("aria-pressed", "true"));
  expect(stato.rpc).toHaveBeenCalledWith("commessa_permesso_rilievi", { p_ordine: "scuola", p_persona: "geometra", p_consentito: true });
  fireEvent.click(revoca);
  await waitFor(() => expect(revoca).not.toBeInTheDocument());
  expect(stato.rpc).toHaveBeenCalledWith("commessa_accesso_tecnico", { p_ordine: "scuola", p_persona: "geometra", p_consentito: false });
});

it("dalla stessa scheda il capocantiere aggiorna una sottofase senza cambiare pagina", async () => {
  stato.salvaFasi = true;
  monta(<Routes><Route path="/campo/cantieri/:orderId" element={<CampoSchedaCantiere />} /></Routes>, "/campo/cantieri/scuola");
  const fase = (await screen.findByText("Scavi")).closest("summary")!;
  fireEvent.click(fase);
  fireEvent.click(await screen.findByRole("button", { name: "Aggiorna sottofase Tracciamento" }));
  const dialogo = await screen.findByRole("dialog", { name: "Aggiorna sottofase" });
  fireEvent.click(await within(dialogo).findByRole("button", { name: "Completata" }));
  fireEvent.change(within(dialogo).getByLabelText("Nota"), { target: { value: "Tracciato il vano scala" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Salva aggiornamento" }));
  await waitFor(async () => expect(await syncQueue.getAll("avanzamento")).toMatchObject([{ status: "pending", payload: {
    order_id: "scuola", target: { faseId: "scavi", sottofaseId: "tracce", percentuale: 40 }, valore: "100",
    note: "Tracciato il vano scala",
  } }]));
  await waitFor(() => expect(dialogo).not.toBeInTheDocument());
  expect(screen.queryByRole("tab", { name: "Rilievi" })).not.toBeInTheDocument();
});

it("nella stessa scheda il tecnico registra il rilievo quando autorizzato", async () => {
  stato.salvaRilievi = true;
  monta(<Routes><Route path="/campo/cantieri/:orderId" element={<CampoSchedaCantiere />} /></Routes>, "/campo/cantieri/scuola");
  fireEvent.mouseDown(await screen.findByRole("tab", { name: "Rilievi" }), { button: 0 });
  fireEvent.click(await screen.findByRole("button", { name: "Nuovo rilievo" }));
  const dialogo = await screen.findByRole("dialog", { name: "Registra rilievo" });
  expect(await within(dialogo).findByRole("button", { name: "Salva" })).toBeDisabled();
  fireEvent.change(within(dialogo).getByLabelText("Misure rilevate"), { target: { value: "Vano 120 × 150 cm" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Salva" }));
  await waitFor(async () => expect(await syncQueue.getAll("rilievo")).toMatchObject([{ status: "pending", payload: {
    order_id: "scuola", visita: "rilievo", misure: "Vano 120 × 150 cm",
  } }]));
  await waitFor(() => expect(dialogo).not.toBeInTheDocument());
});

it("il capocantiere può chiudere di nuovo una fase riaperta al 100%", async () => {
  stato.salvaFasi = true;
  stato.faseRiaperta = true;
  monta(<Routes><Route path="/campo/cantieri/:orderId" element={<CampoSchedaCantiere />} /></Routes>, "/campo/cantieri/scuola");
  fireEvent.click(await screen.findByRole("button", { name: "Aggiorna fase Posa" }));
  const dialogo = await screen.findByRole("dialog", { name: "Aggiorna fase" });
  const salva = await within(dialogo).findByRole("button", { name: "Salva aggiornamento" });
  expect(salva).toBeDisabled();
  fireEvent.click(within(dialogo).getByRole("button", { name: "Completata" }));
  fireEvent.click(salva);
  await waitFor(async () => expect(await syncQueue.getAll("avanzamento")).toMatchObject([{ status: "pending", payload: {
    target: { faseId: "posa", percentuale: 100 }, valore: "100", chiusuraRichiesta: true,
  } }]));
});
