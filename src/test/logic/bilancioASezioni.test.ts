// Il bilancio a sezioni contrapposte (11/11/2026): stato patrimoniale e conto economico divisi, per mastro.
import { describe, expect, it } from "vitest";
import { bilancioASezioni, htmlBilancioSezioni, saldiPerConto } from "@/lib/contabilita/bilancioCee";
import type { ContoContabile, Scrittura } from "@/lib/contabilita/libroGiornale";

const conto = (id: string, codice: string, descrizione: string, natura: ContoContabile["natura"], mastro_id: string | null = null, movimentabile = true): ContoContabile =>
  ({ id, codice, descrizione, natura, sezione_cee: null, voce_cee: null, mastro_id, movimentabile, attivo: true });
const conti: ContoContabile[] = [
  conto("m-cli", "05", "Crediti verso clienti", "attivo", null, false),
  conto("cli", "05.01", "Clienti", "attivo", "m-cli"),
  conto("ban", "06.01", "Banca", "attivo"),
  conto("m-for", "13", "Debiti", "passivo", null, false),
  conto("for", "13.01", "Fornitori", "passivo", "m-for"),
  conto("cap", "10.01", "Capitale sociale", "passivo"),
  conto("m-cos", "30", "Costi della produzione", "costo", null, false),
  conto("mp", "30.01", "Materie prime", "costo", "m-cos"),
  conto("tr", "30.13", "Trasporti", "costo", "m-cos"),
  conto("ric", "20.01", "Ricavi delle vendite", "ricavo"),
];
const scrittura = (id: string, righe: Array<[string, number, number]>): Scrittura =>
  ({ id, esercizio: 2026, numero: 1, data_registrazione: "2026-05-01", causale: "x", descrizione: null, documento_numero: null, documento_data: null, origine: "manuale", storno_di: null,
    contabilita_righe: righe.map(([conto_id, dare, avere], i) => ({ riga: i + 1, conto_id, dare, avere, descrizione: null as string | null })) } as unknown as Scrittura);
const scritture = [
  scrittura("a", [["ban", 1000, 0], ["cap", 0, 1000]]),
  scrittura("b", [["cli", 5000, 0], ["ric", 0, 5000]]),
  scrittura("c", [["mp", 3000, 0], ["tr", 500, 0], ["for", 0, 3500]]),
];

describe("Bilancio a sezioni contrapposte", () => {
  const b = bilancioASezioni(saldiPerConto(scritture, conti), conti);

  it("divide stato patrimoniale e conto economico, e raggruppa per mastro", () => {
    expect(b.attivo.totale).toBe(6000);
    expect(b.passivo.totale).toBe(4500);
    expect(b.costi.totale).toBe(3500);
    expect(b.ricavi.totale).toBe(5000);
    expect(b.costi.mastri.map((m) => [m.codice, m.totale, m.conti.map((c) => c.codice)])).toEqual([["30", 3500, ["30.01", "30.13"]]]);
    expect(b.attivo.mastri.map((m) => m.descrizione)).toEqual(["Crediti verso clienti", "Senza mastro"]);
  });

  it("l'utile pareggia: attivo = passivo + utile, ricavi = costi + utile", () => {
    expect(b.utile).toBe(1500);
    expect(b.differenzaPatrimoniale).toBe(0);
  });

  it("la stampa ha le quattro parti e l'utile", () => {
    const html = htmlBilancioSezioni({ azienda: { ragione_sociale: "Prova" } as never, bilancio: b, periodo: "Esercizio 2026" });
    for (const t of ["ATTIVO", "PASSIVO E NETTO", "COSTI", "RICAVI", "Utile dell'esercizio", "1.500,00"]) expect(html).toContain(t);
  });
});
