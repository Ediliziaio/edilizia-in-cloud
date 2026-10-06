import { describe, expect, it } from "vitest";
import { IN_SEDE, documentiRichiesti, doveSiTrova, mancanzeMezzo, raggruppaPerPosto } from "@/lib/mezzi/gruppiMezzi";

/** Mezzi e attrezzature raggruppati (06/10/2026): documenti richiesti, cosa manca, dove sono. */

const nessuno = {
  assegnato_order_id: null as string | null, assegnato_commessa: null as string | null, su_mezzo_id: null as string | null,
  su_mezzo_nome: null as string | null, assegnato_hr_profilo_id: null as string | null, assegnato_persona: null as string | null,
};

describe("documenti richiesti", () => {
  it("con la targa assicurazione, bollo e revisione; gru e piattaforme la verifica periodica", () => {
    expect(documentiRichiesti({ tipo: "furgone", possesso: "proprieta" }).map((d) => d.categoria)).toEqual(["assicurazione", "bollo", "revisione"]);
    expect(documentiRichiesti({ tipo: "sollevamento", possesso: "proprieta" }).map((d) => d.categoria)).toEqual(["assicurazione", "verifica_periodica"]);
    expect(documentiRichiesti({ tipo: "macchina_movimento_terra", possesso: "proprieta" }).map((d) => d.categoria)).toEqual(["assicurazione"]);
    expect(documentiRichiesti({ tipo: "attrezzatura", possesso: "proprieta" })).toEqual([]);
  });

  it("in leasing anche il contratto; a noleggio lungo solo il contratto (assicurazione e bollo sono del noleggiatore); a noleggio breve niente", () => {
    expect(documentiRichiesti({ tipo: "furgone", possesso: "leasing" }).map((d) => d.categoria)).toEqual(["assicurazione", "bollo", "revisione", "contratto"]);
    expect(documentiRichiesti({ tipo: "furgone", possesso: "noleggio_lungo" }).map((d) => d.categoria)).toEqual(["contratto"]);
    expect(documentiRichiesti({ tipo: "autocarro", possesso: "noleggio_breve" })).toEqual([]);
  });
});

describe("cosa manca", () => {
  it("le categorie richieste senza nessun documento registrato; fuori servizio non manca niente", () => {
    const m = { tipo: "furgone" as const, possesso: "proprieta" as const, stato: "in_servizio" };
    expect(mancanzeMezzo(m, new Set(["assicurazione"])).map((d) => d.etichetta)).toEqual(["bollo", "revisione"]);
    expect(mancanzeMezzo(m, undefined).map((d) => d.etichetta)).toEqual(["assicurazione", "bollo", "revisione"]);
    expect(mancanzeMezzo({ ...m, stato: "fuori_servizio" }, undefined)).toEqual([]);
  });
});

describe("dove si trova", () => {
  it("sul cantiere anche se lo guida qualcuno; poi a bordo, con una persona, in magazzino", () => {
    expect(doveSiTrova({ ...nessuno, assegnato_order_id: "o1", assegnato_commessa: "ORD-1 · Rossi", assegnato_hr_profilo_id: "p1", assegnato_persona: "Mario" }))
      .toEqual({ chiave: "cantiere:o1", etichetta: "ORD-1 · Rossi", tipo: "cantiere", orderId: "o1" });
    expect(doveSiTrova({ ...nessuno, su_mezzo_id: "m1", su_mezzo_nome: "Ducato bianco" })).toEqual({ chiave: "mezzo:m1", etichetta: "A bordo di Ducato bianco", tipo: "mezzo" });
    expect(doveSiTrova({ ...nessuno, assegnato_hr_profilo_id: "p1", assegnato_persona: "Luca Ferrari" })).toEqual({ chiave: "persona:p1", etichetta: "Con Luca Ferrari", tipo: "persona" });
    expect(doveSiTrova(nessuno)).toEqual({ chiave: "_magazzino", etichetta: "In magazzino", tipo: "magazzino" });
    // i mezzi liberi sono «in sede», non in magazzino
    expect(doveSiTrova(nessuno, IN_SEDE).etichetta).toBe("In sede");
  });

  it("i gruppi: i cantieri più pieni prima, poi a bordo, persone, magazzino in fondo; dentro, per nome", () => {
    const gruppi = raggruppaPerPosto([
      { ...nessuno, id: "a1", nome: "Trapano" },
      { ...nessuno, id: "a2", nome: "Scala", assegnato_hr_profilo_id: "p1", assegnato_persona: "Luca" },
      { ...nessuno, id: "a3", nome: "Betoniera", assegnato_order_id: "o2", assegnato_commessa: "ORD-2" },
      { ...nessuno, id: "a4", nome: "Martello", assegnato_order_id: "o1", assegnato_commessa: "ORD-1" },
      { ...nessuno, id: "a5", nome: "Avvitatore", assegnato_order_id: "o1", assegnato_commessa: "ORD-1" },
      { ...nessuno, id: "a6", nome: "Flex", su_mezzo_id: "m1", su_mezzo_nome: "Ducato" },
    ]);
    expect(gruppi.map((g) => g.etichetta)).toEqual(["ORD-1", "ORD-2", "A bordo di Ducato", "Con Luca", "In magazzino"]);
    expect(gruppi[0].righe.map((r) => r.mezzo.nome)).toEqual(["Avvitatore", "Martello"]);
  });

  it("un ponteggio a m² sta in ogni cantiere dove è montato, con la sua parte, e in magazzino col resto", () => {
    const ponteggio = { ...nessuno, id: "p", nome: "Ponteggio", gestione: "quantita", quantita_totale: 800 };
    const gruppi = raggruppaPerPosto([ponteggio], {
      montaggi: [
        { mezzoId: "p", orderId: "o1", dove: "ORD-1 · Rossi", quantita: 250 },
        { mezzoId: "p", orderId: "o1", dove: "ORD-1 · Rossi", quantita: 50 },
        { mezzoId: "p", orderId: null, dove: "Deposito Vigonza", quantita: 100 },
      ],
    });
    expect(gruppi.map((g) => [g.etichetta, g.tipo, g.righe[0].quantita])).toEqual([
      ["ORD-1 · Rossi", "cantiere", 300],
      ["Deposito Vigonza", "luogo", 100],
      ["In magazzino", "magazzino", 400],
    ]);
    // tutto montato: niente riga in magazzino; mai montato: tutto in magazzino
    expect(raggruppaPerPosto([ponteggio], { montaggi: [{ mezzoId: "p", orderId: "o1", dove: "ORD-1", quantita: 800 }] })
      .map((g) => g.etichetta)).toEqual(["ORD-1"]);
    expect(raggruppaPerPosto([ponteggio]).map((g) => [g.etichetta, g.righe[0].quantita])).toEqual([["In magazzino", 800]]);
    // un posto senza nome non fa un gruppo senza titolo
    expect(raggruppaPerPosto([ponteggio], { montaggi: [{ mezzoId: "p", orderId: null, dove: " ", quantita: 100 }] })[0].etichetta)
      .toBe("Posto non indicato");
  });
});
