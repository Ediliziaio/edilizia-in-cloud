// src/test/logic/sottofasi.test.ts
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import {
  avanzamentoDaSottofasi,
  faseHaSottofasi,
  fasiLavorateDelRapportino,
  messaggioErrore,
  riepilogoSottofasi,
  sottofaseDaRiga,
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
      id: "s1", phase_id: "p1", name: "Tracce", position: 2, peso: 3, fatta: true, fatta_il: "2026-10-07T08:00:00Z",
    });
  });
  it("riempie i vuoti: peso 1, non fatta", () => {
    expect(sottofaseDaRiga({ id: "s1", phase_id: "p1" })).toEqual({
      id: "s1", phase_id: "p1", name: "", position: 0, peso: 1, fatta: false, fatta_il: null,
    });
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
