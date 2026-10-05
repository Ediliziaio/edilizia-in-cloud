/**
 * usePreventivoCosti: costo e unità delle tariffe, costo degli articoli
 * (05/10/2026). Il listino si legge con le regole uniche di
 * src/lib/listino/costoTariffa.ts, così configuratori, dialog e conti del
 * preventivo trovano lo stesso numero.
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBundleProdotti, usePreventivoCosti, type TariffaPro } from "@/hooks/usePreventivoCosti";

type Opzioni = { queryKey: unknown[]; queryFn: () => Promise<unknown> };
const stato = vi.hoisted(() => ({
  opzioni: {} as Record<string, Opzioni>,
  dati: {} as Record<string, unknown>,
  righe: {} as Record<string, unknown[]>,
  select: {} as Record<string, string>,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (o: Opzioni) => {
    const chiave = String(o.queryKey[0]);
    stato.opzioni[chiave] = o;
    return { data: stato.dati[chiave] };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const q = {
        select: (colonne: string) => { stato.select[tabella] = colonne; return q; },
        eq: () => q,
        order: () => q,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: stato.righe[tabella] ?? [], error: null }).then(ok),
      };
      return q;
    },
  },
}));

afterEach(() => {
  cleanup();
  stato.dati = {};
  stato.righe = {};
});

async function tariffeLette(righe: unknown[]): Promise<TariffaPro[]> {
  stato.righe.tariffe_aziendali = righe;
  renderHook(() => usePreventivoCosti("az-1"));
  return (await stato.opzioni["tariffe-aziendali"].queryFn()) as TariffaPro[];
}

describe("Tariffe: costo e unità con la regola unica", () => {
  it("il costo vero in prezzo_costo vince sullo 0 di default di costo_interno, e lo portano entrambe le colonne", async () => {
    const [posa, vuota] = await tariffeLette([
      { id: "t1", nome: "Posa", tipo: "posa", prezzo_vendita: 90, costo_interno: 0, prezzo_costo: 35, costo_default: null, unita: "pz", unita_fatturazione: "pz" },
      { id: "t2", nome: "Senza costo", tipo: "posa", prezzo_vendita: 50, costo_interno: null, prezzo_costo: null, costo_default: null, unita: null, unita_fatturazione: null },
    ]);
    expect(posa).toMatchObject({ prezzo_costo: 35, costo_interno: 35 });
    // Chi legge `costo_interno ?? prezzo_costo` (configuratori) trova lo stesso numero.
    expect(posa.costo_interno ?? posa.prezzo_costo).toBe(35);
    expect(vuota).toMatchObject({ prezzo_costo: 0, costo_interno: null, unita_fatturazione: null });
  });

  it("un «pz» di default smentito dalla legacy non vale: la tariffa al km si conta a km", async () => {
    const [trasporto, giornata] = await tariffeLette([
      { id: "t1", nome: "Trasporto sede→cantiere", tipo: "trasporto", prezzo_vendita: 1.5, prezzo_costo: 0.9, costo_interno: 0, unita: "km", unita_fatturazione: "pz" },
      { id: "t2", nome: "Squadra a giornata", tipo: "posa", prezzo_vendita: 400, prezzo_costo: 250, costo_interno: 250, unita: "h", unita_fatturazione: "gg" },
    ]);
    expect(trasporto.unita_fatturazione).toBe("km");
    expect(giornata.unita_fatturazione).toBe("gg");

    stato.dati["tariffe-aziendali"] = [trasporto, giornata];
    const { result } = renderHook(() => usePreventivoCosti("az-1"));
    // 30 km di cantiere: 45 € di vendita e 27 € di costo, non 1,50 € «a pezzo».
    // La quantità della riga sono i km (05/10/2026): niente più prezzo × distanza a quantità 1.
    expect(result.current.calcolaTariffaAutomatica(trasporto, 30, 0)).toEqual({ prezzo_vendita: 45, prezzo_acquisto: 27 });
    expect(result.current.calcolaTariffaAutomatica(trasporto, 1, 0)).toEqual({ prezzo_vendita: 1.5, prezzo_acquisto: 0.9 });
    expect(result.current.calcolaTariffaAutomatica(giornata, 2)).toEqual({ prezzo_vendita: 800, prezzo_acquisto: 500 });
  });

  it("anche una tariffa scritta a mano (non passata dalla lettura) si conta con la regola unica", () => {
    const { result } = renderHook(() => usePreventivoCosti("az-1"));
    const tariffa = { id: "t9", nome: "Nolo", tipo: "nolo", prezzo_vendita: 100, prezzo_costo: 60, costo_interno: 0, unita: "fisso", unita_fatturazione: "pz" } as TariffaPro;
    // Legacy «fisso» = a corpo: la quantità non conta.
    expect(result.current.calcolaTariffaAutomatica(tariffa, 3)).toEqual({ prezzo_vendita: 100, prezzo_acquisto: 60 });
  });
});

describe("Articoli e bundle", () => {
  it("il costo dell'articolo: prezzo_acquisto_netto, e se è lo 0 di default standard_cost", async () => {
    stato.righe.article_templates = [
      { id: "a1", name: "Finestra", unit_price: 500, prezzo_vendita: 500, prezzo_acquisto_netto: 0, standard_cost: 280, vat_rate: 10, modalita_prezzo: "pz" },
      { id: "a2", name: "Porta", unit_price: 900, prezzo_vendita: 900, prezzo_acquisto_netto: 610, standard_cost: 0, vat_rate: 22, modalita_prezzo: "pz" },
    ];
    renderHook(() => usePreventivoCosti("az-1"));
    const articoli = (await stato.opzioni["article-templates-pro"].queryFn()) as Array<{ prezzo_acquisto_netto: number }>;
    expect(articoli.map((a) => a.prezzo_acquisto_netto)).toEqual([280, 610]);
  });

  it("il bundle legge le colonne che servono a costo e unità delle sue voci", async () => {
    renderHook(() => useBundleProdotti("az-1"));
    await stato.opzioni["bundle-prodotti"].queryFn();
    const colonne = stato.select.bundle_prodotti;
    for (const c of ["costo_interno", "costo_default", "unita_fatturazione", "standard_cost"]) expect(colonne).toContain(c);
  });
});
