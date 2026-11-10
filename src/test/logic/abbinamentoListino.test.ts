import { describe, expect, it } from "vitest";
import { chiaveDescrizione, proponiAbbinamenti, riepilogoProposte, unitaPerListino } from "@/lib/subappaltatori/abbinamentoListino";

const listino = [
  { id: "int", nome: "Intonaco civile a base cemento", codice: "AR.INT.01", unita: "mq" },
  { id: "mag", nome: "Magrone", codice: "ST.MAG", unita: "mc" },
  { id: "mag2", nome: "Magrone", codice: null, unita: "mc" },
  { id: "pompa", nome: "Pompa ricircolo sanitario", codice: null, unita: "pz" },
  { id: "rossi", nome: "Punto luce", codice: "PL", unita: "pz", subappaltatore_id: "rossi" },
];
const voce = (id: string, descrizione: string, unita: string | null, origine_codice: string | null = null) =>
  ({ id, descrizione, unita, origine_codice, tariffa_id: null as string | null });

describe("voci del computo → voci del listino", () => {
  it("stesso codice: sicuro se l'unità combacia (m2 = mq), da guardare se no", () => {
    const [a, b] = proponiAbbinamenti([voce("1", "Intonaco", "m2", "ar.int.01 "), voce("2", "Magrone", "kg", "ST.MAG")], listino, []);
    expect(a).toMatchObject({ tariffaId: "int", motivo: "codice", sicura: true, unitaDiverse: false });
    expect(b).toMatchObject({ tariffaId: "mag", motivo: "codice", sicura: false, unitaDiverse: true });
  });

  it("come l'ultima volta: la descrizione ricordata vince sul nome", () => {
    const [p] = proponiAbbinamenti([voce("1", "POMPA P.3 - Ricircolo sanitario RSA", "cad.")], listino,
      [{ alias_normalized: chiaveDescrizione("POMPA P.3 - Ricircolo sanitario RSA"), tariffa_id: "pompa" }]);
    expect(p).toMatchObject({ tariffaId: "pompa", motivo: "ricordato", sicura: true });
  });

  it("stessa descrizione: solo se il nome è unico («Magrone» ce n'è due: si sceglie)", () => {
    const [a, b] = proponiAbbinamenti([voce("1", "Pompa ricircolo sanitario", "n."), voce("2", "MAGRONE", "mc")], listino, []);
    expect(a).toMatchObject({ tariffaId: "pompa", motivo: "descrizione" });
    expect(b).toMatchObject({ tariffaId: null, motivo: null, sicura: false });
  });

  it("una descrizione ricordata per due voci diverse non propone niente", () => {
    const k = chiaveDescrizione("Pompa ricircolo sanitario");
    const [p] = proponiAbbinamenti([voce("1", "Pompa ricircolo sanitario", "pz")], listino,
      [{ alias_normalized: k, tariffa_id: "pompa" }, { alias_normalized: k, tariffa_id: "int" }]);
    expect(p.tariffaId).toBeNull();
  });

  it("mai verso una voce propria di una ditta, e le voci già collegate non si ripropongono", () => {
    const proposte = proponiAbbinamenti([voce("1", "Punto luce", "pz", "PL"), { ...voce("2", "Magrone", "mc"), tariffa_id: "mag" }], listino, []);
    expect(proposte).toHaveLength(1);
    expect(proposte[0].tariffaId).toBeNull();
  });

  it("«a_corpo» del listino e «a.c.» del computo sono la stessa unità", () => {
    const [p] = proponiAbbinamenti([voce("1", "Oneri", "a.c.", "ONE")], [{ id: "one", nome: "Oneri", codice: "ONE", unita: "a_corpo" }], []);
    expect(p).toMatchObject({ tariffaId: "one", sicura: true, unitaDiverse: false });
  });

  it("riepilogo", () => {
    const proposte = proponiAbbinamenti([voce("1", "x", "mq", "AR.INT.01"), voce("2", "x", "kg", "ST.MAG"), voce("3", "qualcosa", "mq")], listino, []);
    expect(riepilogoProposte(proposte)).toEqual({ sicure: 1, daGuardare: 1, daScegliere: 1 });
  });

  it("la chiave: minuscole, senza accenti né punteggiatura, al massimo 300 caratteri", () => {
    expect(chiaveDescrizione("  Demolizione di caldane, sottofondi — PIÙ  piano ")).toBe("demolizione di caldane sottofondi piu piano");
    expect(chiaveDescrizione("a".repeat(400))).toHaveLength(300);
  });

  it("voce nuova del listino: l'unità diventa quella che il listino accetta", () => {
    expect(unitaPerListino("m2")).toEqual({ unita: "mq", unita_fatturazione: "mq" });
    expect(unitaPerListino("a.c.")).toEqual({ unita: "fisso", unita_fatturazione: "a_corpo" });
    expect(unitaPerListino("cad.")).toEqual({ unita: "pz", unita_fatturazione: "pz" });
    expect(unitaPerListino("mq x cm")).toBeNull();
  });
});
