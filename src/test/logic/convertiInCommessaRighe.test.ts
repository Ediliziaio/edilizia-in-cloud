// Preventivo di modulo → commessa: le righe che arrivano a create_order_atomic
// (05/10/2026).
//  - Ristrutturazione: i costi del computo sono già per unità; si dividevano di
//    nuovo per la quantità (50 m² a 30 €/m² di costo → 0,60 €/m², margine 99%).
//  - order_items.quantity è un intero (la RPC fa ::integer): una quantità con
//    decimali (85,5 m², 7,5 ore) faceva fallire tutta la conversione.
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
        Promise.resolve<Esito>(
          aggiornamento ? { data: null, error: null } : { data: stato.tabelle[tabella]?.lista ?? [], error: null },
        ).then(ok, ko),
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

import { convertiFvInCommessa, convertiRstInCommessa, quantitaPerCommessa } from "@/lib/moduli/convertiInCommessa";

interface RigaInviata {
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  purchase_price: number;
  vat_rate: number;
}

const inviata = () => {
  const chiamata = stato.rpc.find((c) => c.fn === "create_order_atomic");
  if (!chiamata) throw new Error("create_order_atomic non chiamata");
  return chiamata.args as { p_order_data: { total_amount: number; vat_rate: number }; p_items: RigaInviata[] };
};
const somma = (righe: RigaInviata[]) => Math.round(righe.reduce((s, r) => s + r.unit_price * r.quantity, 0) * 100) / 100;

beforeEach(() => {
  stato.rpc.length = 0;
  stato.tabelle = { order_statuses: { riga: { id: "stato-1" } } };
});

describe("quantitaPerCommessa", () => {
  it("quantità intera: prezzo e costo restano per unità", () => {
    expect(quantitaPerCommessa({ quantita: 50, prezzoUnitario: 45, costoUnitario: 30, unita: "mq", descrizione: "Opere" }))
      .toEqual({ quantity: 50, unit_price: 45, purchase_price: 30, description: "Opere" });
  });

  it("quantità con decimali: 1 × il totale, col costo di riga e la quantità vera davanti", () => {
    const r = quantitaPerCommessa({ quantita: 85.5, prezzoUnitario: 30, costoUnitario: 22.4, unita: "mq", descrizione: "Pavimenti" });
    expect(r.quantity).toBe(1);
    expect(r.unit_price).toBe(2565);
    expect(r.purchase_price).toBe(1915.2);
    expect(r.description).toMatch(/^85,5 m² × 30,00\s€ · Pavimenti$/);
  });

  it("il totale della riga non cambia", () => {
    for (const [q, p] of [[85.5, 30], [7.5, 45], [12.345, 9.99], [0.5, 1234.56]] as const) {
      const r = quantitaPerCommessa({ quantita: q, prezzoUnitario: p, costoUnitario: 0 });
      expect(r.unit_price * r.quantity).toBe(Math.round(q * p * 100) / 100);
      expect(Number.isInteger(r.quantity)).toBe(true);
    }
  });
});

describe("ristrutturazione → commessa", () => {
  beforeEach(() => {
    stato.tabelle.rst_progetti = {
      riga: {
        id: "rst-1", company_id: "az-1", code: "RST-2026-001", stato: "accettato", note: "Ristrutturazione appartamento",
        cliente_id: "cli-1", cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Torino",
        // 50 × 45 + 85,5 × 30 = 4.815 €, meno il 10% di sconto globale = 4.333,50 €.
        totale: 5286.87, totale_imponibile: 4333.5, iva_pct: 22, prezzo_manuale: null, ordine_id: null,
      },
    };
    stato.tabelle.rst_computo_voci = {
      lista: [
        { capitolo_nome: "Demolizioni", descrizione: "Rimozione pavimento", unita_misura: "mq", quantita: 50, prezzo_unitario: 45, sconto_pct: 0, importo: 2250, costo_materiali: 20, costo_manodopera: 10, ordine: 0 },
        { capitolo_nome: "Pavimenti", descrizione: "Posa gres", unita_misura: "mq", quantita: 85.5, prezzo_unitario: 30, sconto_pct: 0, importo: 2565, costo_materiali: 14, costo_manodopera: 8, ordine: 1 },
      ],
    };
  });

  it("il costo resta per unità: 50 m² a 30 €/m² di costo non diventano 0,60 €/m²", async () => {
    await convertiRstInCommessa("rst-1", "utente-1");
    const [demolizioni] = inviata().p_items;
    expect(demolizioni).toMatchObject({ quantity: 50, unit_price: 45, purchase_price: 30 });
    // Margine della riga: (45 − 30) / 45 = 33%, non il 99%.
    expect(((demolizioni.unit_price - demolizioni.purchase_price) / demolizioni.unit_price) * 100).toBeCloseTo(33.33, 1);
  });

  it("85,5 m² diventano 1 × 2.565 €, col costo di riga e la quantità nella descrizione", async () => {
    await convertiRstInCommessa("rst-1", "utente-1");
    const righe = inviata().p_items;
    expect(righe.every((r) => Number.isInteger(r.quantity))).toBe(true);
    const gres = righe[1];
    expect(gres).toMatchObject({ name: "Posa gres", quantity: 1, unit_price: 2565, purchase_price: 1881 });
    expect(gres.description).toMatch(/^85,5 m² × 30,00\s€ · Pavimenti$/);
  });

  it("il totale della commessa resta quello del preventivo, sconto compreso", async () => {
    await convertiRstInCommessa("rst-1", "utente-1");
    const { p_order_data, p_items } = inviata();
    expect(p_order_data.total_amount).toBe(4333.5);
    expect(p_order_data.vat_rate).toBe(22);
    // Righe 4.815 € + sconto commerciale −481,50 € = 4.333,50 €.
    expect(p_items.at(-1)).toMatchObject({ name: "Sconto commerciale", unit_price: -481.5, quantity: 1 });
    expect(somma(p_items)).toBe(4333.5);
  });
});

describe("fotovoltaico → commessa", () => {
  it("7,5 ore di manodopera non fanno fallire la conversione", async () => {
    stato.tabelle.fv_progetti = {
      riga: {
        id: "fv-1", company_id: "az-1", numero: "FV-001", titolo: "Impianto 6 kWp", stato: "accettato", cliente_id: "cli-1",
        indirizzo: null, comune: null, prezzo_vendita_iva_inclusa: null, prezzo_vendita_manuale: 5337.5, iva_aliquota: 0.1, ordine_id: null,
      },
    };
    stato.tabelle.fv_componenti_progetto = {
      lista: [{ categoria: "modulo", descrizione: "Modulo 430 W", marca: "Marca", modello: "M430", quantita: 14, prezzo_unitario_netto: 120, prezzo_unitario_vendita: 200, ordinamento: 0 }],
    };
    stato.tabelle.fv_servizi_progetto = { lista: [] };
    stato.tabelle.fv_manodopera_progetto = {
      lista: [{ descrizione: "Installazione", ore: 7.5, tariffa_oraria_netta: 30, tariffa_oraria_vendita: 45, ordinamento: 0 }],
    };

    await convertiFvInCommessa("fv-1", "utente-1");
    const { p_order_data, p_items } = inviata();
    expect(p_items.every((r) => Number.isInteger(r.quantity))).toBe(true);
    expect(p_items[0]).toMatchObject({ quantity: 14, unit_price: 200, purchase_price: 120 });
    expect(p_items[1]).toMatchObject({ name: "Installazione", quantity: 1, unit_price: 337.5, purchase_price: 225 });
    expect(p_items[1].description).toMatch(/^7,5 h × 45,00\s€ · Manodopera$/);
    // 14 × 200 + 337,50 = 3.137,50; il prezzo a corpo (5.337,50) mette la differenza in una riga sua.
    expect(p_order_data.total_amount).toBe(5337.5);
    expect(somma(p_items)).toBe(5337.5);
  });
});
