// src/test/ui/campoAvanzamentoSottofasi.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoAvanzamento from "@/pages/campo/CampoAvanzamento";

const dati = vi.hoisted(() => ({
  fasi: [] as Array<Record<string, unknown>>,
  sottofasi: [] as Array<Record<string, unknown>>,
  scritture: [] as Array<{ tabella: string; patch: Record<string, unknown>; id: unknown }>,
  rifiuto: null as { message: string } | null,
  errore: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: dati.errore } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, profile: { company_id: "c1" } }) }));
vi.mock("@/components/common/ImgRiservata", () => ({ ImgRiservata: (): null => null }));
vi.mock("@/lib/storage/fileRiservati", () => ({ linkFileRiservato: async (u: string) => u }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    const righe = () =>
      tabella === "order_work_phases" ? dati.fasi
      : tabella === "order_work_subphases" ? dati.sottofasi
      : tabella === "orders" ? [{ id: "o1", order_code: "C-1", description: "Bagno", indirizzo_lavori: "Via Roma 1" }]
      : [];
    // Lettura: l'oggetto si può «attendere» a ogni passo della catena.
    const lettura: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: righe(), error: null }).then(ok, ko),
    };
    for (const metodo of ["select", "eq", "in", "order"]) lettura[metodo] = () => lettura;
    return {
      ...lettura,
      update: (patch: Record<string, unknown>) => ({
        eq: (_colonna: string, id: unknown) => { dati.scritture.push({ tabella, patch, id }); return Promise.resolve({ error: dati.rifiuto }); },
      }),
    };
  };
  return { supabase: { from: costruisci, storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } };
});

const fase = (patch: Record<string, unknown>) => ({
  id: "f1", order_id: "o1", name: "Impianto elettrico", position: 0, status: "in_corso", percentuale: 33,
  notes: null as string | null, foto_urls: [] as string[], completata_il: null as string | null, ...patch,
});
const sotto = (patch: Record<string, unknown>) => ({
  id: "s1", phase_id: "f1", name: "Tracce", position: 0, peso: 1, fatta: false, fatta_il: null as string | null, ...patch,
});
const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CampoAvanzamento />
    </QueryClientProvider>,
  );
beforeEach(() => { dati.fasi = []; dati.sottofasi = []; dati.scritture = []; dati.rifiuto = null; dati.errore.mockClear(); });
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
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tracce: da fare" }));
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
});
