/**
 * Fasi di lavoro e date lette nel contratto (15/11/2026).
 *
 * Prima l'AI non leggeva le lavorazioni, e «Nuova commessa» cancellava le date d'inizio e fine anche quando il
 * contratto le scriveva. Ora le fasi diventano una proposta nell'anteprima (o, su una commessa senza fasi, una
 * scelta in «Applica il contratto»), e le date entrano nel modulo se sono vere.
 */
import { describe, expect, it } from "vitest";
import { fasiLavoroDalTesto, parseContractExtract } from "@/lib/orders/contractExtract";
import { contractConfirmations, dateLavoriDalContratto, fasiDalContratto, prepareContract } from "@/lib/orders/contractPreparation";
import { pianoContrattoSuCommessa, type CommessaPerContratto } from "@/lib/orders/contrattoSuCommessa";

const commessa: CommessaPerContratto = { total_amount: null, vat_rate: null, work_start_date: null, work_end_date: null, order_type: "cliente" };

describe("Fasi di lavoro dal contratto", () => {
  it("legge nome, durata e sottofasi, nell'ordine", () => {
    const fasi = fasiLavoroDalTesto([
      { nome: "Demolizioni e rimozioni", giorni: 3, sottofasi: ["Rimozione sanitari", "Demolizione massetto"] },
      { nome: "Impianto idraulico", giorni: null, sottofasi: [] },
    ]);
    expect(fasi).toEqual([
      { nome: "Demolizioni e rimozioni", giorni: 3, sottofasi: ["Rimozione sanitari", "Demolizione massetto"] },
      { nome: "Impianto idraulico", giorni: null, sottofasi: [] },
    ]);
  });

  it("scarta rate, doppioni e nomi vuoti, e mette un tetto", () => {
    const fasi = fasiLavoroDalTesto([
      { nome: "Acconto alla firma" }, { nome: "SAL 1" }, { nome: "Saldo" },
      { nome: "Massetti" }, { nome: "massetti" }, { nome: "  " }, "Tinteggiature",
      ...Array.from({ length: 30 }, (_, i) => ({ nome: `Lavoro ${i}` })),
    ]);
    expect(fasi.slice(0, 2).map((f) => f.nome)).toEqual(["Massetti", "Tinteggiature"]);
    expect(fasi).toHaveLength(15);
  });

  it("durate impossibili diventano null", () => {
    expect(fasiLavoroDalTesto([{ nome: "A", giorni: 0 }, { nome: "B", giorni: 5000 }, { nome: "C", giorni: "4" }]).map((f) => f.giorni)).toEqual([null, null, 4]);
  });

  it("un contratto letto prima, senza il campo, non ha fasi", () => {
    expect(parseContractExtract({ descrizione_lavori: "Bagno" }).fasi_lavoro).toEqual([]);
    expect(fasiDalContratto({})).toEqual([]);
  });

  it("diventano fasi di modello con sottofasi a peso uguale", () => {
    const ex = parseContractExtract({ fasi_lavoro: [{ nome: "Posa pavimenti", giorni: 2, sottofasi: ["Bagno", "Cucina"] }] });
    expect(fasiDalContratto(ex)).toEqual([{ nome: "Posa pavimenti", giorni: 2, sottofasi: [{ nome: "Bagno", peso: 1 }, { nome: "Cucina", peso: 1 }] }]);
  });

  it("la riga «da confermare» dice quante fasi controllare", () => {
    const ex = parseContractExtract({ cliente: { nome_completo: "Mario Rossi" }, fasi_lavoro: [{ nome: "Demolizioni" }, { nome: "Massetti" }] });
    const standard = contractConfirmations(prepareContract(ex, [], "standard")).find((c) => c.key === "standard");
    expect(standard?.testo).toBe("Controllare le 2 fasi di lavoro proposte dal contratto");
  });
});

describe("Date dei lavori dal contratto", () => {
  it("prende solo date vere", () => {
    expect(dateLavoriDalContratto({ data_inizio_lavori: "2027-02-01", data_fine_lavori: "2027-03-31" })).toEqual({ inizio: "2027-02-01", fine: "2027-03-31" });
    expect(dateLavoriDalContratto({ data_inizio_lavori: "2027-02-30", data_fine_lavori: "fine marzo" })).toEqual({ inizio: null, fine: null });
  });

  it("una fine prima dell'inizio non si usa", () => {
    expect(dateLavoriDalContratto({ data_inizio_lavori: "2027-05-01", data_fine_lavori: "2027-03-31" })).toEqual({ inizio: "2027-05-01", fine: null });
  });
});

describe("Contratto su una commessa già creata", () => {
  const ex = parseContractExtract({
    importo_totale_eur: 10000, iva_pct: 10, data_inizio_lavori: "2027-02-01", data_fine_lavori: "2027-01-15",
    fasi_lavoro: [{ nome: "Demolizioni" }, { nome: "Impianti" }],
  });

  it("propone le fasi se la commessa non ne ha", () => {
    const p = pianoContrattoSuCommessa(ex, commessa, [], 0);
    expect(p.fasi.map((f) => f.nome)).toEqual(["Demolizioni", "Impianti"]);
  });

  it("non le aggiunge a una commessa che ha già fasi, e lo dice", () => {
    const p = pianoContrattoSuCommessa(ex, commessa, [], 4);
    expect(p.fasi).toEqual([]);
    expect(p.avvisi).toContain("La commessa ha già 4 fasi: le 2 del contratto non si aggiungono.");
  });

  it("non scrive una fine prima dell'inizio", () => {
    const p = pianoContrattoSuCommessa(ex, commessa, []);
    expect(p.campi.work_start_date).toBe("2027-02-01");
    expect(p.campi.work_end_date).toBeUndefined();
    const conInizio = pianoContrattoSuCommessa(parseContractExtract({ data_fine_lavori: "2027-01-10" }), { ...commessa, work_start_date: "2027-02-01" }, []);
    expect(conInizio.campi.work_end_date).toBeUndefined();
  });
});
