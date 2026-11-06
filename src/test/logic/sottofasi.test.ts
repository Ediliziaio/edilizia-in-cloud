// src/test/logic/sottofasi.test.ts
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import {
  avanzamentoDaSottofasi,
  avanzateDelRapportino,
  percentualeDaQuantita,
  quantitaEseguita,
  faseHaSottofasi,
  fasiLavorateDelRapportino,
  messaggioErrore,
  riepilogoSottofasi,
  SOTTOFASI_NELLA_FASE,
  sottofaseDaRiga,
  sottofasiDalleFasi,
  sottofasiPerFase,
  sottofasiSpuntate,
  statoFaseDaAvanzamento,
} from "@/lib/orders/sottofasi";

const s = (peso: number, fatta: boolean) => ({ peso, fatta });

describe("avanzamentoDaSottofasi", () => {
  it("senza sottofasi non c'è un avanzamento derivato", () => {
    expect(avanzamentoDaSottofasi([])).toBeNull();
  });
  it("pesi uguali: parte fatta sul totale", () => {
    expect(avanzamentoDaSottofasi([s(1, true), s(1, false), s(1, false), s(1, false)])).toBe(25);
  });
  it("pesi diversi: conta il peso, non il numero", () => {
    expect(avanzamentoDaSottofasi([s(3, true), s(1, false)])).toBe(75);
  });
  it("arrotonda come il database: 1/8 = 12,5 → 13", () => {
    expect(avanzamentoDaSottofasi(Array.from({ length: 8 }, (_, i) => s(1, i === 0)))).toBe(13);
  });
  it("tutte fatte 100, nessuna 0", () => {
    expect(avanzamentoDaSottofasi([s(2, true), s(5, true)])).toBe(100);
    expect(avanzamentoDaSottofasi([s(2, false)])).toBe(0);
  });
  it("un peso non valido conta 1", () => {
    expect(avanzamentoDaSottofasi([s(0, true), s(-4, false)])).toBe(50);
  });
});

describe("statoFaseDaAvanzamento (specchio di fase_avanzamento_derivato)", () => {
  it.each([
    // [stato di prima, %, stato che si prova a scrivere, stato che resta]
    ["da_iniziare", 0, "da_iniziare", "da_iniziare"],
    ["in_corso", 0, "in_corso", "in_corso"],
    ["completata", 0, "completata", "in_corso"],      // una fase chiusa con sottofasi da fare si riapre
    ["in_corso", 0, "da_iniziare", "da_iniziare"],    // a 0% l'ufficio sceglie lo stato
    ["da_iniziare", 0, "in_corso", "in_corso"],
    ["da_iniziare", 0, "completata", "da_iniziare"],  // non si chiude da sola
    ["in_corso", 40, "da_iniziare", "in_corso"],      // sopra lo 0% decide il calcolo
    ["completata", 80, "completata", "in_corso"],
    ["da_iniziare", 100, "da_iniziare", "completata"],
    ["completata", 100, "completata", "completata"],
  ] as const)("era %s, %s%%, si prova a scrivere %s → %s", (precedente, percentuale, proposto, atteso) => {
    expect(statoFaseDaAvanzamento(precedente, percentuale, proposto)).toBe(atteso);
  });
  it("senza uno stato proposto vale quello di prima", () => {
    expect(statoFaseDaAvanzamento("completata", 50)).toBe("in_corso");
    expect(statoFaseDaAvanzamento("in_corso", 0)).toBe("in_corso");
  });
});

describe("riepilogoSottofasi e faseHaSottofasi", () => {
  it("conta fatte e totali", () => {
    expect(riepilogoSottofasi([{ fatta: true }, { fatta: false }, { fatta: true }])).toEqual({ fatte: 2, totale: 3 });
    expect(riepilogoSottofasi([])).toEqual({ fatte: 0, totale: 0 });
  });
  it("una fase deriva dalle sottofasi solo se ne ha almeno una", () => {
    expect(faseHaSottofasi(undefined)).toBe(false);
    expect(faseHaSottofasi([])).toBe(false);
    expect(faseHaSottofasi([{}])).toBe(true);
  });
});

describe("sottofasiPerFase", () => {
  it("raggruppa per fase e ordina per posizione", () => {
    const m = sottofasiPerFase([
      { id: "c", phase_id: "p1", position: 2 },
      { id: "a", phase_id: "p1", position: 0 },
      { id: "x", phase_id: "p2", position: 0 },
      { id: "b", phase_id: "p1", position: 1 },
    ]);
    expect(m.get("p1")!.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(m.get("p2")!.map((r) => r.id)).toEqual(["x"]);
    expect(m.get("p3")).toBeUndefined();
  });
});

describe("sottofaseDaRiga", () => {
  it("normalizza una riga del database e ignora l'incorporato della fase", () => {
    expect(sottofaseDaRiga({ id: "s1", phase_id: "p1", name: "Tracce", position: 2, peso: 3, fatta: true, fatta_il: "2026-10-07T08:00:00Z", fase: { order_id: "o1" } })).toEqual({
      id: "s1", phase_id: "p1", name: "Tracce", position: 2, peso: 3, fatta: true, fatta_il: "2026-10-07T08:00:00Z", percentuale: 0, quantita_fatta: null,
      data_inizio: null, data_fine: null, giorni: null, in_parallelo: false, iniziata_il: null, giorni_lavorati: 0, risorse: null,
    });
  });
  it("riempie i vuoti: peso 1, non fatta", () => {
    expect(sottofaseDaRiga({ id: "s1", phase_id: "p1" })).toEqual({
      id: "s1", phase_id: "p1", name: "", position: 0, peso: 1, fatta: false, fatta_il: null, percentuale: 0, quantita_fatta: null,
      data_inizio: null, data_fine: null, giorni: null, in_parallelo: false, iniziata_il: null, giorni_lavorati: 0, risorse: null,
    });
  });
});

describe("sottofasiDalleFasi", () => {
  it("raccoglie le sottofasi annidate nelle fasi, in ordine di posizione", () => {
    const fasi = [
      { id: "p1", sottofasi: [{ id: "s2", phase_id: "p1", name: "Cavi", position: 1, peso: 1, fatta: false, fatta_il: null }] },
      { id: "p2", sottofasi: [] },
      { id: "p3", sottofasi: [{ id: "s1", phase_id: "p3", name: "Tracce", position: 0, peso: 2, fatta: true, fatta_il: "2026-10-12T08:00:00Z" }] },
    ];
    expect(sottofasiDalleFasi(fasi).map((x) => x.id)).toEqual(["s1", "s2"]);
    expect(sottofasiDalleFasi(fasi)[0]).toEqual({
      id: "s1", phase_id: "p3", name: "Tracce", position: 0, peso: 2, fatta: true, fatta_il: "2026-10-12T08:00:00Z", percentuale: 0, quantita_fatta: null,
      data_inizio: null, data_fine: null, giorni: null, in_parallelo: false, iniziata_il: null, giorni_lavorati: 0, risorse: null,
    });
  });
  it("senza fasi o senza sottofasi dà un elenco vuoto", () => {
    expect(sottofasiDalleFasi(null)).toEqual([]);
    expect(sottofasiDalleFasi([{ id: "p1" }])).toEqual([]);
  });
  it("la lettura parte dalle fasi con le sottofasi annidate", () => {
    expect(SOTTOFASI_NELLA_FASE).toBe("sottofasi:order_work_subphases(id, phase_id, name, position, peso, fatta, fatta_il, percentuale, quantita_fatta, data_inizio, data_fine, giorni, in_parallelo, risorse, iniziata_il, giorni_lavorati)");
  });
});

describe("avanzamento della singola sottofase", () => {
  it("una voce a metà conta per metà", () => {
    expect(avanzamentoDaSottofasi([{ peso: 1, fatta: false, percentuale: 50 }, { peso: 1, fatta: false, percentuale: 0 }])).toBe(25);
  });
  it("non arriva al 100 per un arrotondamento", () => {
    expect(avanzamentoDaSottofasi([{ peso: 100, fatta: true }, { peso: 1, fatta: false, percentuale: 99 }])).toBe(99);
    expect(avanzamentoDaSottofasi([{ peso: 1, fatta: true }, { peso: 1, fatta: false, percentuale: 100 }])).toBe(100);
  });
  it("dalla quantità: 100 solo se è tutta, mai 0 se qualcosa è fatto", () => {
    expect(percentualeDaQuantita(120, 306)).toBe(39);
    expect(percentualeDaQuantita(305.9, 306)).toBe(99);
    expect(percentualeDaQuantita(0.1, 306)).toBe(1);
    expect(percentualeDaQuantita(306, 306)).toBe(100);
    expect(percentualeDaQuantita(400, 306)).toBe(100);
    expect(percentualeDaQuantita(5, null)).toBeNull();
  });
  it("la lettura dal database porta percentuale e quantità", () => {
    const [letta] = sottofasiDalleFasi([{ sottofasi: [{ id: "s", phase_id: "p", percentuale: 41, quantita_fatta: "7.000" }] }]);
    expect(letta.percentuale).toBe(41);
    expect(letta.quantita_fatta).toBe(7);
  });
  it("la quantità scritta vale finché dice lo stesso della percentuale", () => {
    expect(quantitaEseguita({ percentuale: 39, quantitaFatta: 120, quantita: 306 })).toBe(120);
    expect(quantitaEseguita({ percentuale: 100, quantitaFatta: 120, quantita: 306 })).toBe(306);
    expect(quantitaEseguita({ percentuale: 0, quantitaFatta: 120, quantita: 306 })).toBe(0);
    expect(quantitaEseguita({ percentuale: 50, quantitaFatta: null, quantita: null })).toBeNull();
  });
});

describe("Rapportino: quanto è stato fatto", () => {
  const delle = new Map([["f", [{ id: "a", peso: 1, fatta: false, percentuale: 0 }, { id: "b", peso: 1, fatta: false, percentuale: 0 }]]]);
  it("chi scrive una percentuale ci ha lavorato, e l'anteprima la conta", () => {
    const [v] = fasiLavorateDelRapportino({ f: 0 }, delle, [], [], { a: { percentuale: 50 } });
    expect(v.sottofasi_lavorate).toEqual(["a"]);
    expect(v.sottofasi_avanzate).toEqual([{ id: "a", percentuale: 50 }]);
    expect(v.percentuale).toBe(25);
  });
  it("una sottofase finita oggi non porta anche l'avanzata", () => {
    const [v] = fasiLavorateDelRapportino({ f: 0 }, delle, ["a"], [], { a: { percentuale: 50 } });
    expect(v.sottofasi_fatte).toEqual(["a"]);
    expect(v.sottofasi_avanzate).toBeUndefined();
  });
  it("riaprendo il rapportino torna quello che c'era", () => {
    expect(avanzateDelRapportino([{ sottofasi_avanzate: [{ id: "a", quantita: 3 }] }, {}])).toEqual({ a: { quantita: 3 } });
    expect(avanzateDelRapportino(null)).toEqual({});
  });
});

describe("messaggioErrore", () => {
  it("legge il messaggio di un errore di Supabase (un oggetto, non un Error)", () => {
    expect(messaggioErrore({ code: "42501", message: "Le sottofasi le spunta il capocantiere." })).toBe("Le sottofasi le spunta il capocantiere.");
  });
  it("legge anche un Error e una stringa", () => {
    expect(messaggioErrore(new Error("Rete assente"))).toBe("Rete assente");
    expect(messaggioErrore("Boom")).toBe("Boom");
  });
  it("senza messaggio usa quello di riserva", () => {
    expect(messaggioErrore(null)).toBe("Operazione non riuscita. Riprova.");
    expect(messaggioErrore({ message: "  " }, "Non riesco a salvare")).toBe("Non riesco a salvare");
  });
});

describe("refreshWorkQueries", () => {
  it("aggiorna anche le sottofasi della commessa", () => {
    const qc = new QueryClient();
    const spia = vi.spyOn(qc, "invalidateQueries");
    refreshWorkQueries(qc, "o1");
    expect(spia).toHaveBeenCalledWith({ queryKey: ["order_work_subphases", "o1"] });
    expect(spia).toHaveBeenCalledWith({ queryKey: ["campo-sottofasi"] });
  });
  it("aggiorna anche l'avanzamento della commessa letto dal database", () => {
    const qc = new QueryClient();
    const spia = vi.spyOn(qc, "invalidateQueries");
    refreshWorkQueries(qc, "o1");
    expect(spia).toHaveBeenCalledWith({ queryKey: ["order-avanzamento", "o1"] });
  });
});

describe("fasiLavorateDelRapportino", () => {
  const sotto = new Map([
    ["f1", [
      { id: "s1", peso: 1, fatta: true },
      { id: "s2", peso: 1, fatta: false },
      { id: "s3", peso: 1, fatta: false },
    ]],
  ]);
  it("una fase senza sottofasi resta {phase_id, percentuale}, come oggi", () => {
    expect(fasiLavorateDelRapportino({ f9: 60 }, sotto, ["s2"])).toEqual([{ phase_id: "f9", percentuale: 60 }]);
  });
  it("una fase con sottofasi porta le spunte di questo rapportino e l'avanzamento che ne deriva", () => {
    expect(fasiLavorateDelRapportino({ f1: 33 }, sotto, ["s2"])).toEqual([{ phase_id: "f1", percentuale: 67, sottofasi_fatte: ["s2"] }]);
  });
  it("le sottofasi già fatte non si ripetono, e le spunte di fasi non dichiarate si ignorano", () => {
    expect(fasiLavorateDelRapportino({ f1: 33 }, sotto, ["s1", "s9"])).toEqual([{ phase_id: "f1", percentuale: 33, sottofasi_fatte: [] }]);
  });
  it("senza spunte la voce resta una voce di sottofasi, vuota: all'approvazione non tocca la percentuale", () => {
    expect(fasiLavorateDelRapportino({ f1: 33 }, sotto, [])).toEqual([{ phase_id: "f1", percentuale: 33, sottofasi_fatte: [] }]);
  });
  it("il numero di voci è quello delle fasi dichiarate: le spunte stanno DENTRO la voce (un'attribuzione di costo alla fase vale solo con una voce sola)", () => {
    expect(fasiLavorateDelRapportino({ f1: 33 }, sotto, ["s2", "s3"])).toHaveLength(1);
  });
});

describe("sottofasiSpuntate", () => {
  it("raccoglie gli id spuntati da tutte le voci di un rapportino già salvato", () => {
    expect(sottofasiSpuntate([
      { phase_id: "f1", percentuale: 67, sottofasi_fatte: ["s2", "s3"] },
      { phase_id: "f2", percentuale: 10 },
      { phase_id: "f3", percentuale: 5, sottofasi_fatte: ["s9", 4, null] },
    ])).toEqual(["s2", "s3", "s9"]);
  });
  it("senza un elenco valido non c'è niente", () => {
    expect(sottofasiSpuntate(null)).toEqual([]);
    expect(sottofasiSpuntate("x")).toEqual([]);
    expect(sottofasiSpuntate([null, 3, {}])).toEqual([]);
  });
});
