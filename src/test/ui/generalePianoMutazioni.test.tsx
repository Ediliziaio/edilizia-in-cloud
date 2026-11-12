import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { annotaStimeDiPartenza, messaggioPiano, useApprovaPiano, useImportaBusinessPlanPiano } from "@/hooks/useGeneralePiano";
import { vociDiPartenza } from "@/lib/orders/generali/pianoCategorie";
import { DA_STIMARE, riferimentoImportazione } from "@/lib/orders/generali/budgetCompletezza";

const m = vi.hoisted(() => ({
  voci: [] as Record<string, unknown>[],
  ordine: [] as string[],
  rpc: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "utente" }, effectiveCompany: { id: "societa" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: m.rpc,
    storage: { from: () => ({ upload: m.upload }) },
    from: (tabella: string) => {
      let data: unknown = tabella === "generale_piano_voci" ? m.voci : null;
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: () => q,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        insert: (righe: Record<string, unknown>[] | Record<string, unknown>) => {
          m.ordine.push(tabella);
          if (tabella === "generale_piano_voci") {
            m.voci.push(...(righe as Record<string, unknown>[]));
            data = (righe as Record<string, unknown>[]).map((_, i) => ({ id: `v-${i}` }));
          } else data = { id: "allegato" };
          return q;
        },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      };
      return q;
    },
  },
}));
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);
beforeEach(() => {
  m.voci = [];
  m.ordine = [];
  m.rpc.mockReset();
  m.upload.mockReset().mockImplementation(async () => {
    m.ordine.push("originale");
    return { error: null };
  });
});
it("ricontrolla i dati persistiti prima di chiamare l'approvazione", async () => {
  m.voci = [
    {
      id: "1",
      tipo: "costo",
      categoria: "costruzione",
      descrizione: "Costruzione",
      importo: 0,
      mese: null,
      nota: DA_STIMARE,
    },
  ];
  const { result } = renderHook(() => useApprovaPiano("generale"), { wrapper });
  await act(async () => {
    await expect(result.current.mutateAsync({ versioneId: "versione", nota: null })).rejects.toThrow(
      "Budget incompleto",
    );
  });
  expect(m.rpc).not.toHaveBeenCalled();
});
it("archivia l'originale prima delle voci e rifiuta un secondo caricamento dello stesso scenario", async () => {
  const hash = "a".repeat(64),
    file = new File(["xlsx"], "Business plan.xlsx");
  const voce = {
    tipo: "costo" as const,
    categoria: "costruzione" as const,
    descrizione: "Costruzione",
    importo: 0,
    mese: null,
    durataMesi: 1,
    nota: `${riferimentoImportazione(hash, "Realistico", 12)} ${DA_STIMARE}`,
  };
  const { result } = renderHook(() => useImportaBusinessPlanPiano("generale", "versione"), { wrapper });
  const richiesta = { voci: [voce], origine: { file, hash, foglio: "Realistico" } };
  await act(async () => {
    await result.current.mutateAsync(richiesta);
  });
  expect(m.ordine).toEqual(["originale", "order_attachments", "generale_piano_voci"]);
  expect(m.upload.mock.calls[0][0]).toBe(`generale/business-plan/versione/${hash}.xlsx`);
  expect(m.voci[0].nota).toContain(DA_STIMARE);
  await act(async () => {
    const errore = await result.current.mutateAsync(richiesta).catch(e => e);
    expect(messaggioPiano(errore, "il business plan")).toContain("già stati importati");
  });
  expect(m.upload).toHaveBeenCalledTimes(1);
});

it('conserva le stime mancanti quando il backend iniziale ignora le note', async () => {
  const update=vi.fn(); const eq=vi.fn(), inside=vi.fn(), is=vi.fn();
  const q={update:(v:unknown)=>{update(v);return q;},eq:(...v:unknown[])=>{eq(...v);return q;},in:(...v:unknown[])=>{inside(...v);return q;},is:(...v:unknown[])=>{is(...v);return Promise.resolve({error:null});}};
  await annotaStimeDiPartenza('versione',vociDiPartenza('sviluppo','2026-11',100000),{from:()=>q});
  expect(update).toHaveBeenCalledWith({nota:DA_STIMARE});
  expect(eq).toHaveBeenCalledWith('versione_id','versione');
  expect(eq).toHaveBeenCalledWith('importo',0);
  expect(inside).toHaveBeenCalledWith('ordine',[20,30,40,50,60,70,80,90]);
  expect(is).toHaveBeenCalledWith('nota',null);
});
it('non ignora un errore nel salvataggio delle stime mancanti', async () => {
  const q={update:()=>q,eq:()=>q,in:()=>q,is:()=>Promise.resolve({error:{message:'Note non salvate'}})};
  await expect(annotaStimeDiPartenza('v',vociDiPartenza('sviluppo','2026-11',100000),{from:()=>q})).rejects.toMatchObject({message:'Note non salvate'});
});
