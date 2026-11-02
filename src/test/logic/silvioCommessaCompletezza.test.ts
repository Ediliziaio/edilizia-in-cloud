/**
 * Punteggio di completezza della commessa (fase 0, lotto 0.2), calcolato dal registro.
 * Dati inventati.
 */
import { describe, it, expect } from "vitest";
import type { Frammento, Valore } from "../../../shared/silvio-commessa/piano.ts";
import { REGISTRO } from "../../../shared/silvio-commessa/registro.ts";
import {
  chiaveRighe, compilata, completezza, completezzaPiano, sqlCompilata, sqlPunteggio, type DatiCommessa,
} from "../../../shared/silvio-commessa/completezza.ts";
import { fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";

const TOTALE = REGISTRO.reduce((s, v) => s + v.peso, 0);
const vuota: DatiCommessa = { order: {}, righe: {} };

/** Una commessa piena: ogni variabile col peso è compilata. */
function piena(): DatiCommessa {
  const order: Record<string, unknown> = {};
  const righe: Record<string, number> = {};
  for (const v of REGISTRO) {
    const c = v.controllo;
    if (c.tipo === "colonne") order[c.colonne[0]] = c.regola === "positivo" ? 1000 : "x";
    else righe[chiaveRighe(c.tabelle[0], c.conColonna)] = 2;
  }
  return { order, righe };
}

describe("completezza di una commessa vera", () => {
  it("vuota fa 0 e manca tutto quello che pesa, dal più pesante", () => {
    const c = completezza(vuota);
    expect(c.punteggio).toBe(0);
    expect(c.mancano).toHaveLength(REGISTRO.filter((v) => v.peso > 0).length);
    expect(c.mancano[0].peso).toBe(3);
    expect(c.perArea.mezzi.punteggio).toBeNull(); // nell'area niente pesa
  });

  it("piena fa 100", () => {
    const c = completezza(piena());
    expect(c.punteggio).toBe(100);
    expect(c.mancano).toEqual([]);
  });

  it("la commessa tipica di oggi: anagrafica e importo sì, fasi rate e persone no", () => {
    const tipica: DatiCommessa = {
      order: {
        order_code: "C-0001", description: "Rifacimento bagno", customer_id: "cli-1", client_name: "Cliente Prova",
        client_phone: "000", client_address: "Via Inventata 1", total_amount: 12000, vat_rate: 10,
        payment_type: "bonifico", assigned_to: "u-1", expected_date: null, order_type: "standard",
      },
      righe: {},
    };
    const c = completezza(tipica);
    const fatto = 1 + 1 + 2 + 1 + 1 + 1 + 3 + 1 + 1 + 2; // le colonne sopra, coi loro pesi
    expect(c.punteggio).toBe(Math.round((100 * fatto) / TOTALE));
    expect(c.mancano.map((v) => v.chiave)).toContain("fasi.order_work_phases");
    expect(c.perArea.economia.mancano).toEqual(["economia.order_items"]);
  });

  it("le regole del controllo: testo vuoto non conta, importo zero non conta, una colonna su due basta", () => {
    const importo = REGISTRO.find((v) => v.chiave === "economia.total_amount")!;
    const nome = REGISTRO.find((v) => v.chiave === "cliente.nome")!;
    const dateFasi = REGISTRO.find((v) => v.chiave === "fasi.date_fasi")!;
    expect(compilata(importo, { order: { total_amount: 0 }, righe: {} })).toBe(false);
    expect(compilata(importo, { order: { total_amount: 0.5 }, righe: {} })).toBe(true);
    expect(compilata(nome, { order: { client_name: "  ", client_company: null }, righe: {} })).toBe(false);
    expect(compilata(nome, { order: { client_company: "Impresa Prova" }, righe: {} })).toBe(true);
    // Le fasi senza date non bastano per «date delle fasi».
    expect(compilata(dateFasi, { order: {}, righe: { order_work_phases: 3 } })).toBe(false);
    expect(compilata(dateFasi, { order: {}, righe: { "order_work_phases.start_date": 1 } })).toBe(true);
  });
});

describe("completezza della bozza", () => {
  const v = (valore: unknown): Omit<Valore, "fonte"> => ({ valore, fiducia: 1, stato: "fatto" });
  const fr = (aree: Frammento["aree"]): Frammento => ({ fonte: { tipo: "preventivo", id: "q-1", etichetta: "PR-0001" }, aree });

  it("conta i valori pieni, non le liste vuote né lo stato «manca»", () => {
    const p = fondi(pianoVuoto("az-1"), fr({
      economia: { "economia.total_amount": v(12000), "economia.order_items": v([]) },
      fasi: { "fasi.work_start_date": { valore: "2026-11-09", fiducia: 0.2, stato: "manca" } },
      persone: { "persone.squadra": v(["dip-1"]) },
    }));
    const c = completezzaPiano(p);
    expect(c.compilate.map((x) => x.chiave).sort()).toEqual(["economia.total_amount", "persone.squadra"]);
    expect(c.punteggio).toBe(Math.round((100 * 5) / TOTALE));
  });

  it("le date delle fasi si leggono nella lista delle fasi", () => {
    const senzaDate = fondi(pianoVuoto("az-1"), fr({ fasi: { "fasi.order_work_phases": v([{ name: "Demolizioni" }]) } }));
    expect(completezzaPiano(senzaDate).compilate.map((x) => x.chiave)).toEqual(["fasi.order_work_phases"]);
    const conDate = fondi(pianoVuoto("az-1"), fr({
      fasi: { "fasi.order_work_phases": v([{ name: "Demolizioni" }, { name: "Impianti", start_date: "2026-11-12" }]) },
    }));
    expect(completezzaPiano(conDate).compilate.map((x) => x.chiave)).toEqual(["fasi.order_work_phases", "fasi.date_fasi"]);
  });

  it("un conflitto aperto conta come compilato ma resta da decidere", () => {
    let p = fondi(pianoVuoto("az-1"), fr({ economia: { "economia.total_amount": v(47900) } }));
    p = fondi(p, { fonte: { tipo: "contratto", id: "f-1", etichetta: "Contratto.pdf" }, aree: { economia: { "economia.total_amount": v(48500) } } });
    const c = completezzaPiano(p);
    expect(c.compilate.map((x) => x.chiave)).toEqual(["economia.total_amount"]);
    expect(c.daDecidere.map((x) => x.chiave)).toEqual(["economia.total_amount"]);
  });
});

describe("completezza in SQL, dallo stesso registro", () => {
  it("le espressioni hanno la forma attesa", () => {
    const per = (k: string) => sqlCompilata(REGISTRO.find((v) => v.chiave === k)!);
    expect(per("economia.total_amount")).toBe("(coalesce(o.total_amount, 0) > 0)");
    expect(per("cliente.nome")).toBe(
      "(nullif(btrim(o.client_name::text), '') is not null or nullif(btrim(o.client_company::text), '') is not null)");
    expect(per("fasi.date_fasi")).toBe(
      "(exists (select 1 from public.order_work_phases x where x.order_id = o.id and x.start_date is not null))");
  });

  it("il punteggio somma i pesi e divide per il totale", () => {
    const sql = sqlPunteggio("ord");
    expect(sql.startsWith("round(100.0 * (")).toBe(true);
    expect(sql.endsWith(`) / ${TOTALE})`)).toBe(true);
    expect(sql.match(/case when/g)).toHaveLength(REGISTRO.filter((v) => v.peso > 0).length);
    expect(sql).toContain("ord.total_amount");
    expect(() => sqlPunteggio("o; drop table x")).toThrow("Nome SQL non valido");
  });
});
