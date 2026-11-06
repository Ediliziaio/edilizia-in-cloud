import { describe, expect, it } from "vitest";
import { proposteDaStrumenti, rispostaFasi, type ContestoFasi } from "../../../shared/silvio-commessa/chatFasi";
import { contestoFasiPerSilvio } from "@/lib/orders/silvioFasi";

const ctx: ContestoFasi = {
  oggi: "2026-11-05",
  commessa: "PROVA",
  fasi: [{
    id: "f1", nome: "Impianti", stato: "in_corso", percentuale: 40, dal: null, al: null, chi: [],
    sottofasi: [
      { id: "s1", nome: "Tracce", fatta: true, percentuale: 100, dal: null, al: null, giorni: null },
      { id: "s2", nome: "Sanitari", fatta: false, percentuale: 0, dal: null, al: null, giorni: null, chi: ["Mario Rossi"] },
    ],
  }],
  persone: [{ id: "p1", nome: "Mario Rossi" }, { id: "p2", nome: "Luca Bianchi" }],
  squadre: [{ id: "q1", nome: "Squadra A" }],
  ditte: [{ id: "d1", nome: "Ditta Idraulica" }],
};

describe("Silvio nelle fasi: dalle chiamate alle proposte", () => {
  it("tiene solo date vere, future, su righe che esistono e non fatte", () => {
    const { proposte, scartate } = proposteDaStrumenti([{ nome: "date_lavori", argomenti: { righe: [
      { id: "s2", dal: "2026-11-09", al: "2026-11-11" },
      { id: "f1", dal: "2026-11-09", al: "2026-11-20" },
      { id: "s1", dal: "2026-11-09", al: "2026-11-10" },
      { id: "zz", dal: "2026-11-09", al: "2026-11-10" },
      { id: "s2", dal: "2026-11-12", al: "2026-11-10" },
      { id: "f1", dal: "2026-11-01", al: "2026-11-03" },
    ] } }], ctx);
    expect(proposte).toEqual([
      expect.objectContaining({ tipo: "date", livello: "sottofase", id: "s2", dal: "2026-11-09", al: "2026-11-11" }),
      expect.objectContaining({ tipo: "date", livello: "fase", id: "f1" }),
    ]);
    expect(scartate.join(" ")).toMatch(/già fatta/);
    expect(scartate.join(" ")).toMatch(/non esiste/);
    expect(scartate.join(" ")).toMatch(/passato/);
  });

  it("le sottofasi nuove non ripetono quelle che ci sono", () => {
    const { proposte } = proposteDaStrumenti([{ nome: "nuove_sottofasi", argomenti: { fase_id: "f1", nomi: ["sanitari", "Collaudo", "Collaudo", ""] } }], ctx);
    expect(proposte).toEqual([{ tipo: "sottofasi", faseId: "f1", fase: "Impianti", nomi: ["Collaudo"] }]);
  });

  it("chi fa: solo persone, squadre e ditte dell'elenco, e non chi c'è già", () => {
    const { proposte, scartate } = proposteDaStrumenti([{ nome: "chi_fa", argomenti: { righe: [
      { sottofase_id: "s2", chi_id: "p1" },
      { sottofase_id: "s2", chi_id: "d1" },
      { sottofase_id: "s2", chi_id: "q1" },
      { sottofase_id: "s2", chi_id: "inventato" },
    ] } }], ctx);
    expect(proposte.map((p) => p.tipo === "chi" && `${p.chi}:${p.genere}`)).toEqual(["Ditta Idraulica:ditta", "Squadra A:squadra"]);
    expect(scartate).toHaveLength(1);
  });

  it("legge solo gli strumenti conosciuti, con argomenti in testo JSON", () => {
    const r = rispostaFasi({ content: " Ecco. ", tool_calls: [
      { function: { name: "date_lavori", arguments: "{\"righe\":[]}" } },
      { function: { name: "cancella_tutto", arguments: "{}" } },
    ] });
    expect(r.testo).toBe("Ecco.");
    expect(r.strumenti).toEqual([{ nome: "date_lavori", argomenti: { righe: [] } }]);
  });

  it("il contesto porta sottofasi, quantità e chi le fa", () => {
    const c = contestoFasiPerSilvio({
      oggi: "2026-11-05", commessa: "PROVA",
      fasi: [{ id: "f1", name: "Impianti", status: "in_corso", percentuale: 40, start_date: null, end_date: null, assignments: [{ executor_label: "Mario Rossi" }, { executor_label: "Mario Rossi" }] }],
      sottofasiDi: new Map([["f1", [{ id: "s2", name: "Sanitari", fatta: false, percentuale: 20 }]]]),
      quantita: new Map([["s2", { quantita: 4, unita: "cad" }]]),
      chiDi: () => ["Ditta Idraulica"],
      persone: [], squadre: [], ditte: [],
    });
    expect(c.fasi[0].chi).toEqual(["Mario Rossi"]);
    expect(c.fasi[0].sottofasi[0]).toMatchObject({ id: "s2", percentuale: 20, quantita: "4 cad", chi: ["Ditta Idraulica"] });
  });
});
