// src/test/ui/campoAvanzamentoSottofasi.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CampoAvanzamento from "@/pages/campo/CampoAvanzamento";

const dati = vi.hoisted(() => ({
  fasi: [] as Array<Record<string, unknown>>,
  sottofasi: [] as Array<Record<string, unknown>>,
  scritture: [] as Array<{ tabella: string; patch: Record<string, unknown>; id: unknown }>,
  rifiuto: null as { message: string } | null,
  errore: vi.fn(),
  sync: vi.fn(),
  errorePermessi: false,
  regola: 'tutti' as unknown,
  ruolo: {capocantiere:false, esiste_capo:true, caposquadra:false} as unknown,
  mieFasi: [] as unknown,
  filtri: [] as Array<[string, unknown]>,
}));
vi.mock("@/hooks/useCommessaCampoSync", () => ({useCommessaCampoSync:dati.sync}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: dati.errore } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, profile: { company_id: "c1" } }) }));
vi.mock("@/components/common/ImgRiservata", () => ({ ImgRiservata: (): null => null }));
vi.mock("@/lib/storage/fileRiservati", () => ({ linkFileRiservato: async (u: string) => u }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    // Le sottofasi arrivano annidate nelle fasi dell'azienda («sottofasi»).
    const righe = () =>
      tabella === "order_work_phases" ? dati.fasi.map((f) => ({ ...f, sottofasi: dati.sottofasi.filter((s) => s.phase_id === f.id) }))
      : tabella === "orders" ? [{ id: "o1", order_code: "C-1", description: "Bagno", indirizzo_lavori: "Via Roma 1" }]
      : [];
    // Lettura: l'oggetto si può «attendere» a ogni passo della catena.
    const lettura: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: righe(), error: null }).then(ok, ko),
    };
    for (const metodo of ["select", "in", "order"]) lettura[metodo] = () => lettura;
    lettura.eq = (col:string, val:unknown) => {dati.filtri.push([col,val]);return lettura;};
    return {
      ...lettura,
      update: (patch: Record<string, unknown>) => ({
        eq: (_colonna: string, id: unknown) => { dati.scritture.push({ tabella, patch, id }); return Promise.resolve({ error: dati.rifiuto }); },
      }),
    };
  };
  return { supabase: { from: costruisci, rpc: async (nome:string) => ({data:nome === 'fasi_regola_chi_spunta' ? dati.regola : nome === 'campo_mio_ruolo' ? dati.ruolo : dati.mieFasi, error:dati.errorePermessi ? {message:'offline'} : null}), storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } };
});

const fase = (patch: Record<string, unknown>) => ({
  id: "f1", order_id: "o1", name: "Impianto elettrico", position: 0, status: "in_corso", percentuale: 33,
  notes: null as string | null, foto_urls: [] as string[], completata_il: null as string | null, ...patch,
});
const sotto = (patch: Record<string, unknown>) => ({
  id: "s1", phase_id: "f1", name: "Tracce", position: 0, peso: 1, fatta: false, fatta_il: null as string | null, ...patch,
});
const disegna = (url = "/campo/avanzamento") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}><CampoAvanzamento /></MemoryRouter>
    </QueryClientProvider>,
  );
beforeEach(() => { dati.fasi = []; dati.sottofasi = []; dati.scritture = []; dati.rifiuto = null; dati.errore.mockClear(); dati.sync.mockClear(); dati.errorePermessi=false; dati.regola='tutti'; dati.ruolo={capocantiere:false,esiste_capo:true,caposquadra:false}; dati.mieFasi=[];dati.filtri=[]; });
afterEach(cleanup);

describe("Avanzamento lavori con le sottofasi", () => {
  it("una fase con sottofasi mostra la checklist: spuntare scrive solo «fatta» sulla sottofase", async () => {
    dati.fasi = [fase({})];
    dati.sottofasi = [sotto({ fatta: true }), sotto({ id: "s2", name: "Cavi", position: 1 }), sotto({ id: "s3", name: "Quadro", position: 2 })];
    disegna();
    expect(await screen.findByText("Impianto elettrico")).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "Tracce: fatta" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: da fare" }));
    await waitFor(() => expect(dati.scritture).toContainEqual({ tabella: "order_work_subphases", patch: { fatta: true }, id: "s2" }));
    expect(dati.scritture.some((s) => s.tabella === "order_work_phases")).toBe(false);
  });

  it("la fase con sottofasi non si chiude con un tocco: la chiudono le sottofasi", async () => {
    dati.fasi = [fase({})];
    dati.sottofasi = [sotto({})];
    disegna();
    const cerchio = await screen.findByRole("button", { name: "Impianto elettrico: si completa spuntando le sottofasi" });
    expect(cerchio).toBeDisabled();
  });

  it("se la regola dell'azienda non te lo permette, vedi la frase del database (non un errore generico)", async () => {
    dati.fasi = [fase({})];
    dati.sottofasi = [sotto({})];
    dati.rifiuto = { message: "Le sottofasi le spunta il capocantiere." };
    disegna();
    const controllo = await screen.findByRole("checkbox", { name: "Tracce: da fare" });
    await waitFor(() => expect(controllo).toBeEnabled());
    fireEvent.click(controllo);
    await waitFor(() => expect(dati.errore).toHaveBeenCalledWith("Le sottofasi le spunta il capocantiere."));
  });

  it("una fase senza sottofasi si chiude come prima", async () => {
    dati.fasi = [fase({ id: "f2", name: "Opere murarie" })];
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: "Segna Opere murarie come completata" }));
    await waitFor(() => expect(dati.scritture).toContainEqual({
      tabella: "order_work_phases",
      patch: expect.objectContaining({ status: "completata", percentuale: 100 }),
      id: "f2",
    }));
  });

  it("una lettura dei permessi fallita mantiene le fasi in consultazione", async () => {
    dati.fasi=[fase({})];dati.errorePermessi=true;disegna();
    expect(await screen.findByText(/Permessi di avanzamento non disponibili/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Impianto elettrico: la segna/})).toBeDisabled();
    expect(dati.scritture).toHaveLength(0);
  });
  it("un ruolo incompleto non equivale all'assenza di capocantiere", async () => {
    dati.fasi=[fase({})];dati.regola='capi';dati.ruolo={};disegna();
    expect(await screen.findByText(/Permessi di avanzamento non disponibili/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Impianto elettrico: la segna/})).toBeDisabled();
  });
  it("solo il capocantiere può aggiornare con regola capi e un capo assegnato", async () => {
    dati.fasi=[fase({})];dati.regola='capi';disegna();
    await screen.findByText('La segna il capocantiere.');
    expect(screen.getByRole('button',{name:/Impianto elettrico: la segna/})).toBeDisabled();
  });
  it("il capocantiere verificato può segnare la fase", async () => {
    dati.fasi=[fase({})];dati.regola='capi';dati.ruolo={capocantiere:true,esiste_capo:true,caposquadra:false};disegna();
    const pulsante=await screen.findByRole('button',{name:'Segna Impianto elettrico come completata'});
    await waitFor(()=>expect(pulsante).toBeEnabled());fireEvent.click(pulsante);
    await waitFor(()=>expect(dati.scritture).toHaveLength(1));
  });
  it("la commessa di provenienza filtra entrambe le letture delle fasi e conserva il ritorno", async () => {
    dati.fasi=[fase({})];disegna('/campo/avanzamento?order_id=o1');
    expect(await screen.findByRole('link',{name:/Torna al cantiere/})).toHaveAttribute('href','/campo/lavoro/o1');
    await waitFor(()=>expect(dati.filtri.filter(([k,v])=>k==='order_id'&&v==='o1').length).toBeGreaterThanOrEqual(2));
  });
});

it("la vista della commessa riceve gli aggiornamenti dalle altre sessioni", async () => {
 dati.fasi=[fase({})];disegna('/campo/avanzamento?order_id=o1');
 expect(await screen.findByText("Impianto elettrico")).toBeInTheDocument();
 expect(dati.sync).toHaveBeenCalledWith("o1","c1",true);
});
