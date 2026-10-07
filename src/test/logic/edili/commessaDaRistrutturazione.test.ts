/**
 * Preventivo di Ristrutturazione → commessa (06/10/2026): le righe che arrivano a
 * `create_order_atomic` sommano al totale del preventivo, senza righe inventate.
 *
 * Una voce con quantità 0 (non prevista, o lasciata da compilare) vale 0 € nel preventivo:
 * `Number(v.quantita) || 1` la trasformava in 1 × il suo prezzo, e la commessa si
 * riempiva di una riga da 500 € che nel preventivo non c'era, compensata da una riga
 * «Sconto commerciale» di −500 € che nessuno aveva concesso. Database finto, funzione vera.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calcTotaliComputo } from "@/lib/ristrutturazione/calcoli";

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
      single: riga, maybeSingle: riga,
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

import { convertiRstInCommessa } from "@/lib/moduli/convertiInCommessa";

interface RigaInviata { name: string; description: string | null; quantity: number; unit_price: number; purchase_price: number; vat_rate: number }
const inviata = () => {
  const chiamata = stato.rpc.find((c) => c.fn === "create_order_atomic");
  if (!chiamata) throw new Error("create_order_atomic non chiamata");
  return chiamata.args as { p_order_data: { total_amount: number; balance_amount: number; vat_rate: number }; p_items: RigaInviata[] };
};
const somma = (righe: RigaInviata[]) => Math.round(righe.reduce((s, r) => s + Math.round(r.unit_price * r.quantity * 100), 0)) / 100;

interface VoceDb { capitolo_nome: string; descrizione: string; unita_misura: string; quantita: number; prezzo_unitario: number; sconto_pct: number; importo: number; costo_materiali: number; costo_manodopera: number; ordine: number }
const voce = (descrizione: string, quantita: number, prezzo: number, sconto = 0, ordine = 0): VoceDb => ({
  capitolo_nome: "Opere", descrizione, unita_misura: quantita % 1 ? "mq" : "cad", quantita, prezzo_unitario: prezzo, sconto_pct: sconto,
  importo: 0, costo_materiali: 0, costo_manodopera: 0, ordine,
});

/** Prepara il preventivo come lo salverebbe il wizard: i totali li calcola il calcolo vero. */
function preparaPreventivo(voci: VoceDb[], opzioni: { sconto?: number; iva?: number; manuale?: number | null }) {
  const t = calcTotaliComputo(
    voci.map((v) => ({ capitolo_nome: v.capitolo_nome, quantita: v.quantita, prezzo_unitario: v.prezzo_unitario, sconto_pct: v.sconto_pct, costo_materiali: 0, costo_manodopera: 0 })),
    { sconto_pct: opzioni.sconto ?? 0, iva_pct: opzioni.iva ?? 22, prezzo_manuale: opzioni.manuale ?? null },
  );
  stato.tabelle.rst_progetti = {
    riga: {
      id: "rst-1", company_id: "az-1", code: "RST-2026-001", stato: "accettato", note: "Ristrutturazione", cliente_id: "cli-1",
      cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Torino",
      totale: t.totale, totale_imponibile: t.imponibile, iva_pct: opzioni.iva ?? 22, prezzo_manuale: opzioni.manuale ?? null, ordine_id: null,
    },
  };
  stato.tabelle.rst_computo_voci = { lista: voci };
  return t;
}

beforeEach(() => {
  stato.rpc.length = 0;
  stato.tabelle = { order_statuses: { riga: { id: "stato-1" } } };
});

describe("ristrutturazione → commessa: le righe sommano al totale del preventivo", () => {
  it("una voce con quantità 0 resta una voce a 0 €: niente riga da 500 € e niente «Sconto commerciale» di compenso", async () => {
    preparaPreventivo([voce("Demolizione", 1, 1000), voce("Posa non prevista", 0, 500, 0, 1)], {});
    await convertiRstInCommessa("rst-1", "utente-1");
    const { p_order_data, p_items } = inviata();
    expect(p_order_data.total_amount).toBe(1000);
    expect(p_items.map((r) => r.name)).toEqual(["Demolizione", "Posa non prevista"]);
    expect(p_items[1]).toMatchObject({ quantity: 1, unit_price: 0, purchase_price: 0 });
    expect(somma(p_items)).toBe(1000);
  });

  it("una quantità mancante (null, testo) vale come 0: nel preventivo la riga non porta importo", async () => {
    preparaPreventivo([voce("Opere", 2, 300), { ...voce("Da compilare", 0, 80, 0, 1), quantita: null as unknown as number }], {});
    await convertiRstInCommessa("rst-1", "utente-1");
    const { p_order_data, p_items } = inviata();
    expect(p_order_data.total_amount).toBe(600);
    expect(p_items.at(-1)).toMatchObject({ name: "Da compilare", unit_price: 0 });
    expect(p_items.some((r) => r.name === "Sconto commerciale")).toBe(false);
    expect(somma(p_items)).toBe(600);
  });

  it("quantità decimali, sconto di riga e sconto globale: la somma delle righe è il totale della testata, a centesimi esatti", async () => {
    // 12,5 mq × 33,33 = 416,63 · 3 × 1.234,56 − 10% = 3.333,31 · 7 × 19,99 = 139,93 → lordo 3.889,87; sconto globale 7,5%
    const voci = [voce("Pavimento", 12.5, 33.33), voce("Infissi", 3, 1234.56, 10, 1), voce("Maniglie", 7, 19.99, 0, 2)];
    const t = preparaPreventivo(voci, { sconto: 7.5, iva: 10 });
    await convertiRstInCommessa("rst-1", "utente-1");
    const { p_order_data, p_items } = inviata();
    // La testata porta l'imponibile del preventivo, lo stesso che stampa il PDF.
    expect(p_order_data.total_amount).toBe(t.imponibile);
    expect(p_order_data.vat_rate).toBe(10);
    // Le righe (con lo sconto in una riga sua) sommano esattamente a quel totale.
    expect(somma(p_items)).toBe(t.imponibile);
    expect(p_order_data.balance_amount).toBe(t.imponibile);
  });

  it("col prezzo scritto a mano le righe a 0 € si completano con una riga «Prezzo a corpo» che porta tutto il totale", async () => {
    const t = preparaPreventivo([voce("Lavori vari", 1, 0), voce("Finiture", 4, 0, 0, 1)], { manuale: 12345.67, sconto: 5 });
    await convertiRstInCommessa("rst-1", "utente-1");
    const { p_order_data, p_items } = inviata();
    expect(p_order_data.total_amount).toBe(t.imponibile);
    expect(p_items.at(-1)).toMatchObject({ name: "Prezzo a corpo", quantity: 1 });
    expect(somma(p_items)).toBe(t.imponibile);
  });

  it.each([[0, 0], [4, 4], [10, 10], [22, 22]])("l'aliquota IVA %s%% arriva alla commessa come %s%% (lo 0 non diventa 22)", async (iva, atteso) => {
    preparaPreventivo([voce("Opere", 1, 1000)], { iva });
    await convertiRstInCommessa("rst-1", "utente-1");
    expect(inviata().p_order_data.vat_rate).toBe(atteso);
    expect(inviata().p_items.every((r) => r.vat_rate === atteso)).toBe(true);
  });

  it("un computo che vale zero non diventa una commessa a zero", async () => {
    preparaPreventivo([voce("Da prezzare", 3, 0)], {});
    await expect(convertiRstInCommessa("rst-1", "utente-1")).rejects.toThrow(/computo è vuoto/);
    expect(stato.rpc.some((c) => c.fn === "create_order_atomic")).toBe(false);
  });
});
