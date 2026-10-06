/**
 * Preventivo fotovoltaico → commessa: l'importo che passa alla commessa è l'imponibile del preventivo
 * (il PDF della commessa ci aggiunge l'IVA), le righe sommano a quell'importo e l'aliquota è quella del
 * preventivo. I numeri sono fatti a mano su un listino di 16 pannelli a 180 € + un inverter a 1.500 €
 * (4.380 € di imponibile pieno), lo stesso dei test del calcolo finanziario.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Risposta = { lista?: unknown[]; riga?: unknown };
const stato = vi.hoisted(() => ({
  tabelle: {} as Record<string, Risposta>,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}));
type Esito = { data: unknown; error: { message: string } | null };

vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    let aggiornamento = false;
    const q: Record<string, unknown> = {};
    const stesso = (): Record<string, unknown> => q;
    const riga = async (): Promise<Esito> => ({ data: stato.tabelle[tabella]?.riga ?? null, error: null });
    Object.assign(q, {
      select: stesso, eq: stesso, order: stesso, limit: stesso,
      update: (): Record<string, unknown> => { aggiornamento = true; return q; },
      single: riga,
      maybeSingle: riga,
      then: (ok: (v: Esito) => unknown, ko: (e: unknown) => unknown) =>
        Promise.resolve<Esito>(aggiornamento ? { data: null, error: null } : { data: stato.tabelle[tabella]?.lista ?? [], error: null }).then(ok, ko),
    });
    return q;
  };
  return {
    supabase: {
      from: (tabella: string) => catena(tabella),
      rpc: async (fn: string, args: Record<string, unknown>): Promise<Esito> => {
        stato.rpc.push({ fn, args });
        if (fn === "create_order_atomic") return { data: { id: "ordine-1", success: true }, error: null };
        if (fn === "prossimo_numero_commessa") return { data: "C-2026-001", error: null };
        return { data: null, error: null };
      },
    },
  };
});

import { convertiFvInCommessa } from "@/lib/moduli/convertiInCommessa";

interface RigaInviata { name: string; quantity: number; unit_price: number; purchase_price: number; vat_rate: number }
const inviata = () => {
  const chiamata = stato.rpc.find((c) => c.fn === "create_order_atomic");
  if (!chiamata) throw new Error("create_order_atomic non chiamata");
  return chiamata.args as { p_order_data: { total_amount: number; vat_rate: number; balance_amount: number }; p_items: RigaInviata[] };
};
const somma = (righe: RigaInviata[]) => Math.round(righe.reduce((s, r) => s + r.unit_price * r.quantity, 0) * 100) / 100;

/** 16 pannelli a 180 € (costo 120) + un inverter a 1.500 € (costo 1.000): 4.380 € di imponibile pieno. */
const LISTINO = [
  { categoria: "pannello", descrizione: "Pannello 450 W", marca: "Acme", modello: "P450", quantita: 16, prezzo_unitario_netto: 120, prezzo_unitario_vendita: 180, ordinamento: 0 },
  { categoria: "inverter", descrizione: "Inverter 6 kW", marca: "Acme", modello: "I6", quantita: 1, prezzo_unitario_netto: 1000, prezzo_unitario_vendita: 1500, ordinamento: 1 },
];

function progetto(extra: Record<string, unknown>) {
  stato.tabelle.fv_progetti = {
    riga: {
      id: "fv-1", company_id: "az-1", numero: "FV-2026-0001", titolo: "Impianto 7,2 kWp", stato: "emesso", cliente_id: "cli-1",
      indirizzo: "Via Roma 1", comune: "Vicenza", prezzo_vendita_iva_inclusa: 4818, prezzo_vendita_manuale: null, iva_aliquota: 0.1, ordine_id: null,
      ...extra,
    },
  };
}

beforeEach(() => {
  stato.rpc.length = 0;
  stato.tabelle = {
    order_statuses: { riga: { id: "stato-1" } },
    fv_componenti_progetto: { lista: LISTINO },
    fv_servizi_progetto: { lista: [] },
    fv_manodopera_progetto: { lista: [] },
  };
});

describe("preventivo fotovoltaico → commessa: importo, righe e IVA", () => {
  it("senza sconto, IVA 10%: totale 4.818 → imponibile 4.380 = somma delle righe, nessuna riga di aggiustamento", async () => {
    progetto({});
    await convertiFvInCommessa("fv-1", "utente-1");
    const { p_order_data, p_items } = inviata();
    expect(p_order_data.total_amount).toBe(4380);
    expect(p_order_data.vat_rate).toBe(10);
    expect(p_items).toHaveLength(2);
    expect(somma(p_items)).toBe(4380);
    expect(p_items.every((r) => r.vat_rate === 10)).toBe(true);
  });

  it("sconto del 5% con IVA 22%: totale 5.076,42 → imponibile 4.161; le righe (4.380) più «Sconto commerciale» −219 sommano a 4.161", async () => {
    // 4.380 − 5% (219) = 4.161 di imponibile; IVA 22% = 915,42; totale 5.076,42
    progetto({ prezzo_vendita_iva_inclusa: 5076.42, iva_aliquota: 0.22 });
    await convertiFvInCommessa("fv-1", "utente-1");
    const { p_order_data, p_items } = inviata();
    expect(p_order_data.total_amount).toBe(4161);
    expect(p_order_data.vat_rate).toBe(22);
    const sconto = p_items.find((r) => r.name === "Sconto commerciale");
    expect(sconto).toMatchObject({ quantity: 1, unit_price: -219 });
    expect(somma(p_items)).toBe(4161);
    // l'IVA della commessa (22% su 4.161) è quella del preventivo: 5.076,42
    expect(Math.round(p_order_data.total_amount * 1.22 * 100) / 100).toBe(5076.42);
  });

  it("IVA allo 0% (esente): resta 0%, non diventa 22% o 10%, e l'importo è il totale", async () => {
    progetto({ prezzo_vendita_iva_inclusa: 4380, iva_aliquota: 0 });
    await convertiFvInCommessa("fv-1", "utente-1");
    const { p_order_data, p_items } = inviata();
    expect(p_order_data.vat_rate).toBe(0);
    expect(p_order_data.total_amount).toBe(4380);
    expect(p_items.every((r) => r.vat_rate === 0)).toBe(true);
  });

  it("un'aliquota salvata come percentuale (10) vale come 10%: l'importo non si divide per 11", async () => {
    progetto({ iva_aliquota: 10 });
    await convertiFvInCommessa("fv-1", "utente-1");
    expect(inviata().p_order_data.total_amount).toBe(4380);
    expect(inviata().p_order_data.vat_rate).toBe(10);
  });

  it("prezzo a corpo di 5.000 € imponibili con IVA 22%: l'importo è 5.000 (non rescorporato), la riga «Prezzo a corpo» porta la differenza di +620", async () => {
    progetto({ prezzo_vendita_manuale: 5000, prezzo_vendita_iva_inclusa: 6100, iva_aliquota: 0.22 });
    await convertiFvInCommessa("fv-1", "utente-1");
    const { p_order_data, p_items } = inviata();
    expect(p_order_data.total_amount).toBe(5000);
    expect(p_items.find((r) => r.name === "Prezzo a corpo")).toMatchObject({ unit_price: 620 });
    expect(somma(p_items)).toBe(5000);
  });

  it("il preventivo già diventato commessa non si converte due volte", async () => {
    progetto({ ordine_id: "ordine-0" });
    await expect(convertiFvInCommessa("fv-1", "utente-1")).rejects.toThrow(/già diventato una commessa/);
    expect(stato.rpc.find((c) => c.fn === "create_order_atomic")).toBeUndefined();
  });

  it("senza un prezzo di vendita la commessa non nasce (nessuna commessa da 0 €)", async () => {
    progetto({ prezzo_vendita_iva_inclusa: null });
    await expect(convertiFvInCommessa("fv-1", "utente-1")).rejects.toThrow(/non ha un prezzo di vendita/);
  });
});
