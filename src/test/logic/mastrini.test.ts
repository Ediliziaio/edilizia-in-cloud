import { describe, expect, it } from "vitest";
import { chiaveSoggetto, contoAPartite, htmlMastrino, mastrino, partitario } from "@/lib/contabilita/mastrini";
import type { ContoContabile, Scrittura } from "@/lib/contabilita/libroGiornale";

const clienti: ContoContabile = {
  id: "clienti", codice: "05.01", descrizione: "Crediti verso clienti", natura: "attivo", sezione_cee: "SPA",
  voce_cee: "C.II.1", mastro_id: null, movimentabile: true, attivo: true,
};

const s = (numero: number, data: string, righe: Array<[string, number, number, string | null]>): Scrittura => ({
  id: `s${numero}`, esercizio: 2026, numero, data_registrazione: data, causale: "Prova", descrizione: null,
  documento_numero: null, documento_data: null, origine: "manuale", storno_di: null,
  contabilita_righe: righe.map(([c, d, a, descr], i) => ({ riga: i + 1, conto_id: c, dare: d, avere: a, descrizione: descr })),
});

const scritture = [
  s(2, "2026-02-10", [["banca", 100, 0, null], ["clienti", 0, 100, "Pagamento Rossi Srl"]]),
  s(1, "2026-01-05", [["clienti", 122, 0, "ROSSI SRL"], ["ricavi", 0, 100, null], ["iva", 0, 22, null]]),
  s(3, "2026-01-20", [["clienti", 50, 0, "Bianchi  spa"], ["ricavi", 0, 50, null]]),
];

describe("mastrino", () => {
  it("mette i movimenti in ordine di data col saldo progressivo", () => {
    const m = mastrino(scritture, "clienti");
    expect(m.movimenti.map((x) => [x.data, x.saldo])).toEqual([["2026-01-05", 122], ["2026-01-20", 172], ["2026-02-10", 72]]);
    expect(m.saldo).toBe(72);
  });
  it("filtra un soggetto solo", () => {
    expect(mastrino(scritture, "clienti", "ROSSI SRL").saldo).toBe(22);
  });
});

describe("partitario", () => {
  it("riconosce lo stesso soggetto scritto in modi diversi", () => {
    expect(chiaveSoggetto("Pagamento Rossi Srl")).toBe("ROSSI SRL");
    expect(chiaveSoggetto("Bianchi  spa")).toBe("BIANCHI SPA");
    expect(chiaveSoggetto(null)).toBe("SENZA NOME");
  });
  it("divide il conto per soggetto, dal saldo più grande", () => {
    expect(partitario(scritture, "clienti").map((p) => [p.soggetto, p.saldo, p.movimenti])).toEqual([
      ["BIANCHI SPA", 50, 1],
      ["ROSSI SRL", 22, 2],
    ]);
  });
  it("sa quali conti hanno le partite", () => {
    expect(contoAPartite(clienti)).toBe(true);
    expect(contoAPartite({ codice: "2010000000", descrizione: "FORNITORI (DA FATTURE RICEVUTE)", codice_standard: "13.04" })).toBe(true);
    expect(contoAPartite({ codice: "30.01", descrizione: "Acquisto materiali", codice_standard: null })).toBe(false);
  });
  it("stampa il mastrino con il saldo", () => {
    const html = htmlMastrino({ azienda: { ragione_sociale: "Prova srl" }, scritture, conto: clienti, dal: "2026-01-01", al: "2026-12-31" });
    expect(html).toContain("Mastrino 05.01");
    expect(html).toContain("72,00");
  });
});
