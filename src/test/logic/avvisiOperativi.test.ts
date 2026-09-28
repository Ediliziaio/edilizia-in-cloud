import { describe, expect, it } from "vitest";
import { componiAvvisi, euro, type DatiAvvisi } from "../../../supabase/functions/_shared/avvisiOperativi";

describe("avvisi operativi del bot", () => {
  it("formatta gli euro all'italiana senza decimali", () => {
    expect(euro(37400)).toBe("€ 37.400");
    expect(euro(0)).toBe("€ 0");
  });

  it("compone l'avviso incassi con totale e righe", () => {
    const dati: DatiAvvisi = {
      fatture_scadute: [
        { id: "1", order_code: "ORD-1", client_name: "Rossi", label: "Saldo", amount: 1000, giorni: 5 },
        { id: "2", order_code: "ORD-2", client_name: "Bianchi", label: "Acconto", amount: 500, giorni: 1 },
      ],
      preventivi_fermi: [],
      sotto_scorta: { n: 0, items: [] },
    };
    const av = componiAvvisi(dati, "2026-09-28");
    expect(av).toHaveLength(1);
    expect(av[0].chiave).toBe("avviso_fatture:2026-09-28");
    expect(av[0].testo).toContain("2 pagamenti");
    expect(av[0].testo).toContain("€ 1.500");
    expect(av[0].testo).toContain("ORD-1 · Rossi");
    expect(av[0].testo).toContain("da 5 giorni");
    expect(av[0].testo).toContain("da 1 giorno");
  });

  it("compone preventivi fermi e sotto scorta", () => {
    const dati: DatiAvvisi = {
      fatture_scadute: [],
      preventivi_fermi: [{ id: "q1", quote_number: "PRV-9", client_name: "Verdi", total: 8000, giorni: 4 }],
      sotto_scorta: { n: 1, items: [{ nome: "Vite 6x80", quantita: 2, minimo: 20 }] },
    };
    const av = componiAvvisi(dati, "2026-09-28");
    const chiavi = av.map((a) => a.chiave);
    expect(chiavi).toContain("avviso_preventivi:2026-09-28");
    expect(chiavi).toContain("avviso_scorta:2026-09-28");
    const prev = av.find((a) => a.chiave.startsWith("avviso_preventivi"))!;
    expect(prev.testo).toContain("PRV-9 · Verdi");
    const scorta = av.find((a) => a.chiave.startsWith("avviso_scorta"))!;
    expect(scorta.testo).toContain("Vite 6x80");
    expect(scorta.testo).toContain("minimo 20");
  });

  it("niente da segnalare = nessun avviso", () => {
    expect(componiAvvisi({ fatture_scadute: [], preventivi_fermi: [], sotto_scorta: { n: 0, items: [] } }, "2026-09-28")).toEqual([]);
    expect(componiAvvisi({}, "2026-09-28")).toEqual([]);
  });
});
