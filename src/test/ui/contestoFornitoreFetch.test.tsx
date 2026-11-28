import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useFattureFornitoreContestuali } from "@/hooks/useFattureFornitoreContestuali";

const stato = vi.hoisted(() => ({ chiamate: [] as Array<{ tipo: string; azienda?: string; ids?: string[]; filtro?: string }>, errore: false, erroreSaldi: false }));
vi.mock("@/integrations/supabase/client", () => {
  const fatture = Array.from({ length: 101 }, (_, i): Record<string, unknown> => ({ id: `F${i}`, numero_fattura: `F${i}`, data_fattura: "2026-11-01", tipo_documento: "TD01", stato: "letta", pagata_il: null, totale_documento: 100, company_cost_id: "costo", piano_pagamento: [] }));
  function catena(tipo: string) {
    let azienda: string | undefined, ids: string[] = [], filtro: string | undefined;
    const q = {
      select: () => q,
      eq: (campo: string, valore: string) => { if (campo === "company_id") azienda = valore; return q; },
      or: (valore: string) => { filtro = valore; return q; },
      in: (_campo: string, valori: string[]) => { ids = valori; return q; },
      order: () => q,
      range: async (da: number, a: number): Promise<{ data: unknown[] | null; error: Error | null }> => {
        stato.chiamate.push({ tipo, azienda, ids, filtro });
        if (stato.errore && tipo === "scadenzario") return { data: null, error: new Error("Scadenzario non disponibile") };
        if (stato.erroreSaldi && tipo === "saldi") return { data: null, error: new Error("Saldi non disponibili") };
        if (tipo === "fatture_ricevute") return { data: fatture.slice(da, a + 1), error: null };
        if (tipo === "saldi") return { data: [{ id: "F0", pagato: 40, residuo: 60, segnata_non_registrata: 10 }, { id: "F1", pagato: 100, residuo: 0 }].slice(da, a + 1), error: null };
        if (tipo === "scadenzario") return { data: ids.includes("F0") ? [{ id: "r1", fattura_id: "F0", numero: 1, scadenza: "2026-12-30", importo: 100, residuo: 30, metodo: "riba", stato: "da_pagare", pagata_il: null, fornitore: "F" }] : [], error: null };
        if (tipo === "rate_fornitori") return { data: ids.includes("F1") ? [{ id: "r2", fattura_ricevuta_id: "F1", numero: 1, scadenza: "2026-12-31", importo: 100, metodo: "riba", stato: "da_pagare", pagata_il: null }] : [], error: null };
        return { data: [], error: null };
      },
    };
    return q;
  }
  return { supabase: { from: (tipo: string) => catena(tipo), rpc: (nome: string, params: { p_company_id: string }) => { const q = catena(nome === "scadenzario_rate_fornitori" ? "scadenzario" : nome === "fatture_ricevute_saldi" ? "saldi" : nome); q.eq("company_id", params.p_company_id); return q; } } };
});

const azienda = "22222222-2222-4222-8222-222222222222";
const fornitore = "33333333-3333-4333-8333-333333333333";
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
beforeEach(() => { stato.chiamate = []; stato.errore = false; stato.erroreSaldi = false; });

it("carica tutte le fatture dello stesso fornitore in blocchi aziendali e unisce le rate disponibili", async () => {
  const { result } = renderHook(() => useFattureFornitoreContestuali({ companyId: azienda, fatturaId: "F0", supplierId: fornitore, piva: "IT01234567890", paese: "IT", enabled: true }), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(101);
  expect(stato.chiamate.filter(c => c.tipo === "scadenzario")).toHaveLength(2);
  expect(stato.chiamate.filter(c => c.tipo === "saldi")).toHaveLength(1);
  expect(stato.chiamate.every(c => c.azienda === azienda)).toBe(true);
  expect(stato.chiamate.find(c => c.tipo === "fatture_ricevute")?.filtro).toContain(`fornitore_id.eq.${fornitore}`);
  expect(result.current.data?.find(f => f.id === "F0")?.scadenze[0].residuo).toBe(30);
  expect(result.current.data?.find(f => f.id === "F0")?.residuoFattura).toBe(60);
  expect(result.current.data?.find(f => f.id === "F0")?.pagatoFattura).toBe(40);
  expect(result.current.data?.find(f => f.id === "F0")?.segnataNonRegistrata).toBe(10);
  expect(result.current.data?.find(f => f.id === "F1")?.scadenze[0].residuo).toBeNull();
  expect(result.current.data?.find(f => f.id === "F1")?.residuoFattura).toBe(0);
  expect(result.current.data?.find(f => f.id === "F1")?.pagatoFattura).toBe(100);
});

it("mostra un errore invece di far credere che non ci siano scadenze se lo scadenzario non risponde", async () => {
  stato.errore = true;
  const { result } = renderHook(() => useFattureFornitoreContestuali({ companyId: azienda, fatturaId: "F0", supplierId: fornitore, enabled: true }), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});

it("mostra un errore quando il servizio dei saldi non è disponibile", async () => {
  stato.erroreSaldi = true;
  const { result } = renderHook(() => useFattureFornitoreContestuali({ companyId: azienda, fatturaId: "F0", supplierId: fornitore, enabled: true }), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});
