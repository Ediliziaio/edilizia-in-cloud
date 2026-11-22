import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import CampoSchedaCantiere from "@/pages/campo/CampoSchedaCantiere";
import { CantieriTecniciLink } from "@/components/campo/CantieriTecniciLink";
import { AccessiTecniciCantiere } from "@/components/orders/AccessiTecniciCantiere";
import { changeFormControl } from "@/test/helpers/changeFormControl";
import type { DocumentoSchedaCantiere, FaseSchedaCantiere, SchedaCantiere } from "@/lib/campo/schedaCantiere";

const stato = vi.hoisted(() => ({
  rpc: vi.fn(), scarica: vi.fn(), accesso: true, salvati: [] as string[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "impresa" }, user: { id: "utente" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: stato.rpc } }));
vi.mock("@/components/orders/filePreviewUtils", () => ({ ATTACHMENTS_BUCKET: "order-attachments", scaricaAllegato: stato.scarica }));
vi.mock("@/hooks/campo/useCampoWorkDay", () => ({ useCampoWorkDay: () => "2026-11-22" }));
vi.mock("@/hooks/useCalendarioCantiere", () => ({ useCalendarioCantiere: () => ({ lavorativo: () => true }) }));

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

beforeEach(() => {
  vi.clearAllMocks();
  stato.accesso = true;
  stato.salvati = [];
  stato.rpc.mockImplementation((nome: string, args: Record<string, unknown>) => {
    if (nome === "commessa_accesso_tecnico") {
      if (args.p_consentito) stato.salvati = [...stato.salvati, String(args.p_persona)];
      else stato.salvati = stato.salvati.filter(id => id !== args.p_persona);
      return Promise.resolve<{ error: null }>({ error: null });
    }
    const persone = [
      { id: "capo", nome: "Marco Capo", abilitato: false, ammissibile: true },
      { id: "geometra", nome: "Giulia Rossi", abilitato: stato.salvati.includes("geometra"), ammissibile: true },
      { id: "sub", nome: "Ditta Esterna", abilitato: false, ammissibile: false },
    ];
    const risposta: { data: unknown; error: { code: string } | null } = nome === "commessa_accessi_tecnici" ? { data: persone, error: null }
      : nome === "campo_cantieri_tecnici" ? { data: stato.accesso ? [cantiere] : [], error: null }
      : !stato.accesso ? { data: null, error: { code: "42501" } }
      : { data: args.p_sezione === "documenti" ? { cantiere, documenti } : { cantiere, fasi }, error: null };
    return { abortSignal: async () => risposta };
  });
});

function monta(contenuto: React.ReactNode, url = "/campo") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[url]}>{contenuto}</MemoryRouter></QueryClientProvider>);
}

it("il capocantiere entra dalla Home, apre le sottofasi, il piano con ritardi e scarica dal dossier", async () => {
  monta(<Routes>
    <Route path="/campo" element={<CantieriTecniciLink area="campo" />} />
    <Route path="/campo/cantieri/:orderId" element={<CampoSchedaCantiere area="campo" />} />
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
    <Route path="/tecnico/cantieri/:orderId" element={<CampoSchedaCantiere area="tecnico" />} />
  </Routes>, "/tecnico/cantieri/scuola?tab=documenti");
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
  fireEvent.click(revoca);
  await waitFor(() => expect(revoca).not.toBeInTheDocument());
  expect(stato.rpc).toHaveBeenCalledWith("commessa_accesso_tecnico", { p_ordine: "scuola", p_persona: "geometra", p_consentito: false });
});
