/**
 * L'archivio «Esporta i dati» scarica le tabelle a blocchi di 1.000 righe.
 * Senza `.order()` Postgres non garantisce lo stesso ordine fra una richiesta e
 * l'altra: una riga poteva comparire due volte o mancare, in un archivio che si
 * chiama backup (136 mila contatti in produzione), e il riepilogo contava le
 * righe ricevute senza accorgersene (10/10/2026).
 *
 * Qui un finto database che, se non gli si chiede l'ordine, serve ogni blocco in
 * un ordine diverso (come può fare Postgres), e se glielo si chiede lo rispetta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  righe: [] as Array<{ id: string; company_id: string }>,
  richieste: [] as Array<{ tabella: string; ordine: string | null; da: number; a: number }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    let ordine: string | null = null;
    let companyId: string | null = null;
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (_colonna: string, valore: string) => { companyId = valore; return b; };
    b.order = (colonna: string) => { ordine = colonna; return b; };
    b.range = (da: number, a: number) => {
      stato.richieste.push({ tabella, ordine, da, a });
      let tutte = stato.righe.filter((r) => r.company_id === companyId);
      if (ordine === "id") {
        tutte = [...tutte].sort((x, y) => x.id.localeCompare(y.id));
      } else {
        // Senza ordine: ogni richiesta vede le righe in un ordine diverso.
        const salto = (stato.richieste.length * 397) % Math.max(tutte.length, 1);
        tutte = [...tutte.slice(salto), ...tutte.slice(0, salto)];
      }
      return Promise.resolve({ data: tutte.slice(da, a + 1), error: null as unknown });
    };
    return b;
  };
  return { supabase: { from: (tabella: string) => catena(tabella) } };
});

import { NON_INCLUSI_TESTO, riepilogoTestuale, scaricaTabella, TABELLE_EXPORT } from "@/lib/export/esportaDatiAzienda";

const id = (n: number) => `id-${String(n).padStart(6, "0")}`;

beforeEach(() => {
  stato.righe = Array.from({ length: 2_500 }, (_, i) => ({ id: id(i), company_id: "c1" }));
  stato.richieste = [];
});

describe("scaricaTabella", () => {
  it("2.500 righe in tre blocchi: nessuna doppia, nessuna mancante", async () => {
    const righe = await scaricaTabella("marketing_contacts", "c1");
    const ids = righe.map((r) => String(r.id));
    expect(ids).toHaveLength(2_500);
    expect(new Set(ids).size).toBe(2_500);
    expect(stato.richieste.map((r) => [r.da, r.a])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("chiede ogni blocco ordinato per id", async () => {
    await scaricaTabella("orders", "c1");
    expect(stato.richieste.every((r) => r.ordine === "id")).toBe(true);
  });

  it("prende solo le righe dell'azienda richiesta", async () => {
    stato.righe = [...stato.righe, ...Array.from({ length: 50 }, (_, i) => ({ id: `altra-${i}`, company_id: "c2" }))];
    const righe = await scaricaTabella("orders", "c1");
    expect(righe).toHaveLength(2_500);
    expect(righe.some((r) => String(r.id).startsWith("altra-"))).toBe(false);
  });

  it("un blocco pieno esatto non si ferma troppo presto", async () => {
    stato.righe = Array.from({ length: 1_000 }, (_, i) => ({ id: id(i), company_id: "c1" }));
    const righe = await scaricaTabella("orders", "c1");
    expect(righe).toHaveLength(1_000);
    expect(stato.richieste).toHaveLength(2);
  });
});

describe("cosa non c'è nell'archivio", () => {
  it("il LEGGIMI.txt dice che mancano costi, scadenze, prima nota, movimenti bancari e dipendenti", () => {
    expect(NON_INCLUSI_TESTO).toBe("costi, scadenze, prima nota, movimenti bancari e dipendenti");
    const testo = riepilogoTestuale([{ tabella: "orders", etichetta: "Commesse", righe: 3 }], "Demo");
    expect(testo).toContain("NON COMPRESI (per ora): costi, scadenze, prima nota, movimenti bancari e dipendenti.");
  });

  it("e lo dice anche quando qualche elenco non si è potuto scaricare", () => {
    const testo = riepilogoTestuale(
      [{ tabella: "tickets", etichetta: "Ticket di assistenza", righe: 0, errore: "permesso negato" }],
      "Demo",
    );
    expect(testo).toContain("NON ESPORTATO");
    expect(testo).toContain("NON COMPRESI (per ora)");
  });

  it("nessuna delle tabelle non comprese è fra i 17 elenchi", () => {
    const tabelle = TABELLE_EXPORT.map((t) => t.tabella);
    for (const non of ["employees", "company_costs", "scadenze", "prima_nota_entries", "bank_transactions"]) {
      expect(tabelle).not.toContain(non);
    }
  });
});
