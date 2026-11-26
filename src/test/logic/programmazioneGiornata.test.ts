import { describe, expect, it } from "vitest";
import { orarioDopoTrascinamento, PX_ORA } from "@/lib/programmazione/calendarioGiorno";
import {
  aggiungiMinuti, aggiungiSquadra, avvisi, abilitazioniDaTitoli, viaggiDelGiro, puntiDelGiro, linkNavigatore, commissioniAgganciate, doveAlle, capoMancante, spostaGruppo, agendaPersone, completaConProposta, cambiaDurata, chiaveNome, proponiRiempimento, spostaOrario, testoProgramma, unisciIntervento, documentiScaduti, esitoSera, giorniLavorativiDopo, giro, giornoDelCantiere, kmGiro, ripetiSuGiorni, giornoOraRoma, leggiOrario, ruoloPersona, testoGiornoCantiere, conteggi, copiaGiornata, ora, proponiGiornata, siSovrappongono, sposta, spostaGiorno,
  type Giornata, type Intervento, type PersonaGiorno,
} from "@/lib/programmazione/giornata";

const persona = (id: string, extra: Partial<PersonaGiorno> = {}): PersonaGiorno => ({
  id, nome: id, cognome: "", colore: null, mansione: null, operaio: true, ruolo: "operaio", squadraId: null, previstoOrderId: null, assenza: null, ...extra,
});
const intervento = (id: string, extra: Partial<Intervento> = {}): Intervento => ({
  id, tipo: "commessa", orderId: id, codice: id, titolo: id, indirizzo: null, faseId: null,
  inizio: null, fine: null, persone: [], capoId: null, mezzi: [], note: null, ...extra,
});

describe("programmazione della giornata", () => {
  it("propone le persone sulla commessa della loro squadra, senza gli assenti", () => {
    const g = proponiGiornata({
      giorno: "2026-11-27",
      commesse: [{ id: "c1", codice: "C1", cliente: "Rossi", descrizione: null, indirizzo: null, inizio: "08:30:00" }],
      persone: [
        persona("marco", { squadraId: "A", previstoOrderId: "c1" }),
        persona("luca", { squadraId: "A", previstoOrderId: "c1", assenza: "In ferie" }),
        persona("paolo"),
      ],
      squadre: [{ id: "A", nome: "A", colore: null, responsabileId: "marco", componenti: ["marco", "luca"] }],
      mezzi: [{ id: "ducato", nome: "Ducato", targa: null, orderId: "c1" }],
    });
    expect(g.interventi).toHaveLength(1);
    expect(g.interventi[0]).toMatchObject({ persone: ["marco"], capoId: "marco", mezzi: ["ducato"], inizio: "08:30", titolo: "Rossi" });
  });

  it("dall'elenco aggiunge (il geometra va in più cantieri), tra interventi sposta, verso l'elenco toglie", () => {
    let g: Giornata = { giorno: "x", interventi: [intervento("a"), intervento("b")] };
    g = sposta(g, { tipo: "persona", id: "geo" }, null, "a");
    g = sposta(g, { tipo: "persona", id: "geo" }, null, "b");
    expect(conteggi(g).persone.get("geo")).toBe(2);
    g = sposta(g, { tipo: "persona", id: "geo" }, "b", "a");
    expect(g.interventi[1].persone).toEqual([]);
    expect(g.interventi[0].persone).toEqual(["geo"]);
    g = sposta(g, { tipo: "persona", id: "geo" }, "a", null);
    expect(conteggi(g).persone.size).toBe(0);
  });

  it("con la copia la persona resta anche dove era; il capo spostato perde il ruolo", () => {
    let g: Giornata = { giorno: "x", interventi: [intervento("a", { persone: ["m"], capoId: "m" }), intervento("b")] };
    expect(sposta(g, { tipo: "persona", id: "m" }, "a", "b", true).interventi.map((i) => i.persone)).toEqual([["m"], ["m"]]);
    g = sposta(g, { tipo: "persona", id: "m" }, "a", "b");
    expect(g.interventi[0].capoId).toBeNull();
  });

  it("una squadra trascinata porta i presenti e il responsabile come capo", () => {
    const g = aggiungiSquadra({ giorno: "x", interventi: [intervento("a")] },
      { id: "A", nome: "A", colore: null, responsabileId: "r", componenti: ["x", "y"] }, "a", new Set(["y"]));
    expect(g.interventi[0]).toMatchObject({ persone: ["r", "x"], capoId: "r" });
  });

  it("avvisa di assenti, interventi vuoti e doppioni che si accavallano, non delle pose in fila", () => {
    const g: Giornata = {
      giorno: "x",
      interventi: [
        intervento("p1", { inizio: "08:00", fine: "10:00", persone: ["gianni"], mezzi: ["furgone"] }),
        intervento("p2", { inizio: "10:30", fine: "12:00", persone: ["gianni"], mezzi: ["furgone"] }),
        intervento("c1", { persone: ["luca", "andrei"] }),
        intervento("c2", { persone: ["andrei"] }),
        intervento("vuoto"),
      ],
    };
    const a = avvisi(g, new Set(["luca"]));
    expect(a).toContainEqual({ tipo: "assente", personaId: "luca", interventoId: "c1" });
    expect(a).toContainEqual({ tipo: "vuoto", interventoId: "vuoto" });
    expect(a).toContainEqual({ tipo: "doppio_persona", personaId: "andrei", interventi: ["c1", "c2"] });
    expect(a.some((x) => x.tipo === "doppio_persona" && x.personaId === "gianni")).toBe(false);
    expect(a.some((x) => x.tipo === "doppio_mezzo")).toBe(false);
  });

  it("orari e giorni", () => {
    expect(ora("7:05:00")).toBe("07:05");
    expect(ora("25:00")).toBeNull();
    expect(siSovrappongono(intervento("a", { inizio: "09:00" }), intervento("b", { inizio: "09:30" }))).toBe(true);
    expect(spostaGiorno("2026-12-31", 1)).toBe("2027-01-01");
    expect(spostaGiorno("2026-03-29", -1)).toBe("2026-03-28");
  });

  it("copiando una giornata gli assenti restano a casa", () => {
    const g = copiaGiornata({ giorno: "ieri", interventi: [intervento("a", { persone: ["m", "l"], capoId: "l" })] }, "oggi", new Set(["l"]));
    expect(g.giorno).toBe("oggi");
    expect(g.interventi[0]).toMatchObject({ persone: ["m"], capoId: null });
    expect(g.interventi[0].id).not.toBe("a");
  });

  it("legge gli orari scritti a mano", () => {
    expect(leggiOrario("8")).toEqual({ inizio: "08:00", fine: null });
    expect(leggiOrario("830")).toEqual({ inizio: "08:30", fine: null });
    expect(leggiOrario("8.30 - 12")).toEqual({ inizio: "08:30", fine: "12:00" });
    expect(leggiOrario("14-12")).toBeNull();
    expect(leggiOrario("pranzo")).toBeNull();
    expect(aggiungiMinuti("08:00", 90)).toBe("09:30");
    expect(aggiungiMinuti("23:00", 120)).toBe("23:59");
  });

  it("chi esce e chi resta in ufficio", () => {
    expect(ruoloPersona(true, "Amministrativo")).toBe("operaio");
    expect(ruoloPersona(false, "Geometra")).toBe("tecnico");
    expect(ruoloPersona(false, "Manutentore caldaie")).toBe("tecnico");
    expect(ruoloPersona(false, "Amministrazione")).toBe("altro");
    expect(ruoloPersona(false, null)).toBe("altro");
    expect(ruoloPersona(false, null, true)).toBe("tecnico");
    expect(chiaveNome(" Mario", "ROSSI ")).toBe(chiaveNome("rossi", "mario"));
  });

  it("sopralluoghi e assistenze del giorno entrano nella proposta con orario e tecnico", () => {
    const g = proponiGiornata({
      giorno: "2026-11-27", commesse: [], persone: [], squadre: [], mezzi: [],
      uscite: [{ id: "s1", tipo: "sopralluogo", titolo: "Verdi", codice: "SOP-1", orderId: null, indirizzo: "Via X", inizio: "14:00", fine: "15:00", persone: ["geo"], note: null }],
    });
    expect(g.interventi[0]).toMatchObject({ tipo: "sopralluogo", fonteId: "s1", persone: ["geo"], inizio: "14:00" });
  });

  it("giorno del cantiere e ora italiana", () => {
    expect(giornoDelCantiere("2026-11-27", "2026-11-25", "2026-12-04")).toMatchObject({ n: 3, di: 10, ritardo: 0 });
    expect(giornoDelCantiere("2026-11-27", null, null)).toBeNull();
    expect(testoGiornoCantiere(giornoDelCantiere("2026-11-27", "2026-07-06", "2026-07-14"))).toBe("Oltre la fine di 136 gg");
    expect(testoGiornoCantiere(giornoDelCantiere("2026-11-27", "2026-11-29", null))).toBe("Inizia tra 2 gg");
    expect(testoGiornoCantiere(giornoDelCantiere("2026-11-27", "2026-11-25", "2026-12-04"))).toBe("Giorno 3 di 10");
    expect(giornoOraRoma("2026-11-27T13:30:00Z")).toEqual({ giorno: "2026-11-27", ora: "14:30" });
    expect(giornoOraRoma("2026-11-27T23:30:00Z").giorno).toBe("2026-11-28");
  });

  it("avvisa se mancano persone o se qualcuno ha documenti scaduti", () => {
    const g: Giornata = { giorno: "x", interventi: [intervento("c1", { persone: ["a"], servono: 3 }), intervento("c2", { persone: ["b"], servono: 1 })] };
    const a = avvisi(g, new Set(), new Set(["b"]));
    expect(a).toContainEqual({ tipo: "mancano", interventoId: "c1", mancano: 2 });
    expect(a).toContainEqual({ tipo: "documenti", personaId: "b", interventoId: "c2" });
    expect(a.some((x) => x.tipo === "mancano" && x.interventoId === "c2")).toBe(false);
    expect(documentiScaduti(persona("p", { documenti: { scaduti: 0, prossima: "2026-11-27" } }), "2026-11-27")).toBe(true);
    expect(documentiScaduti(persona("p", { documenti: { scaduti: 0, prossima: "2026-12-30" } }), "2026-11-27")).toBe(false);
  });

  it("ripete la giornata sui giorni lavorativi dopo", () => {
    expect(giorniLavorativiDopo("2026-11-27", 3)).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
    const copie = ripetiSuGiorni({ giorno: "2026-11-27", interventi: [intervento("a", { persone: ["m", "l"] })] }, ["2026-11-27", "2026-11-30"], (d) => new Set(d === "2026-11-30" ? ["l"] : []));
    expect(copie).toHaveLength(1);
    expect(copie[0]).toMatchObject({ giorno: "2026-11-30" });
    expect(copie[0].interventi[0].persone).toEqual(["m"]);
  });

  it("agenda per persona, giro e previsto contro realtà", () => {
    const roma = { lat: 41.9, lng: 12.5 };
    const vicino = { lat: 41.91, lng: 12.5 };
    const lontano = { lat: 45.46, lng: 9.19 };
    const g: Giornata = { giorno: "x", interventi: [
      intervento("b", { inizio: "11:00", persone: ["geo"], punto: vicino }),
      intervento("a", { inizio: "08:00", persone: ["geo"], punto: roma }),
      intervento("lontano", { persone: ["geo"], punto: lontano }),
      intervento("vicino2", { persone: ["geo"], punto: { lat: 41.92, lng: 12.5 } }),
    ] };
    const agenda = agendaPersone(g).get("geo")!;
    expect(agenda.map((i) => i.id).slice(0, 2)).toEqual(["a", "b"]);
    expect(giro(agenda).map((i) => i.id)).toEqual(["a", "b", "vicino2", "lontano"]);
    expect(kmGiro(giro(agenda).slice(0, 3))).toBeCloseTo(2.2, 0);
    const i = intervento("c1");
    expect(esitoSera(i, null)).toBeNull();
    expect(esitoSera(i, { stato: "uscito", cantiereId: "c1", ore: 8, rapportino: true })).toBe("come_previsto");
    expect(esitoSera(i, { stato: "al_lavoro", cantiereId: "altro", ore: 3, rapportino: false })).toBe("altrove");
    expect(esitoSera(i, { stato: "non_timbrato", cantiereId: null, ore: null, rapportino: false })).toBe("non_timbrato");
    expect(esitoSera(i, { stato: "assente", cantiereId: null, ore: null, rapportino: false })).toBe("assente");
  });

  it("riconosce le abilitazioni dai titoli dei corsi", () => {
    expect(abilitazioniDaTitoli(["Aggiornamento gru a torre", "Addetto antincendio livello 2", "Corso PLE con e senza stabilizzatori"]).sort()).toEqual(["antincendio", "gru", "ple"]);
    expect(abilitazioniDaTitoli(["Visita medica"])).toEqual([]);
  });

  it("avvisa se nessuno ha l'abilitazione richiesta", () => {
    const g: Giornata = { giorno: "x", interventi: [intervento("c1", { persone: ["a"], richiede: ["gru"] })] };
    expect(avvisi(g, new Set(), new Set(), new Map([["a", ["ple"]]]))).toContainEqual({ tipo: "abilitazione", interventoId: "c1", manca: "gru" });
    expect(avvisi(g, new Set(), new Set(), new Map([["a", ["gru"]]])).some((x) => x.tipo === "abilitazione")).toBe(false);
  });

  it("fisso fino a fine lavori: la stessa commessa si sostituisce, una nuova si aggiunge", () => {
    const g: Giornata = { giorno: "x", interventi: [intervento("vecchio", { orderId: "c1", persone: ["z"] })] };
    const r = unisciIntervento(g, intervento("nuovo", { orderId: "c1", persone: ["m", "l"], capoId: "l" }), new Set(["l"]));
    expect(r.interventi).toHaveLength(1);
    expect(r.interventi[0]).toMatchObject({ id: "vecchio", persone: ["m"], capoId: null });
    expect(unisciIntervento(g, intervento("altro", { orderId: "c2" })).interventi).toHaveLength(2);
  });

  it("sposta e allunga gli orari a passi di 15 minuti", () => {
    expect(spostaOrario(intervento("a", { inizio: "08:00", fine: "10:00" }), 50)).toEqual({ inizio: "08:45", fine: "10:45" });
    expect(spostaOrario(intervento("a"), 0, "09:30")).toEqual({ inizio: "09:30", fine: "10:30" });
    expect(cambiaDurata(intervento("a", { inizio: "08:00", fine: "10:00" }), -200)).toEqual({ fine: "08:15" });
  });

  it("riempi i buchi: stessa squadra e previsti prima, mai assenti o doppioni", () => {
    const g: Giornata = { giorno: "x", interventi: [
      intervento("c1", { orderId: "c1", persone: ["capo"], servono: 3, inizio: "08:00", fine: "12:00" }),
      intervento("c2", { orderId: "c2", inizio: "09:00", fine: "11:00", persone: ["occupato"] }),
      intervento("vuoto", { orderId: "c3" }),
    ] };
    const persone = [
      persona("capo"), persona("compagno"), persona("previsto", { previstoOrderId: "c1" }), persona("estraneo"),
      persona("malato", { assenza: "In malattia" }), persona("occupato"), persona("scaduto"),
    ];
    const squadraDi = new Map<string, string | null>([["capo", "A"], ["compagno", "A"]]);
    const s = proponiRiempimento({ giornata: g, persone, squadraDi, senzaDocumenti: new Set(["scaduto"]), puntoDi: () => null });
    const perC1 = s.filter((x) => x.interventoId === "c1").map((x) => x.personaId);
    expect(perC1).toEqual(["previsto", "compagno"]);
    expect(s.some((x) => ["malato", "scaduto", "occupato"].includes(x.personaId))).toBe(false);
    expect(s.filter((x) => x.interventoId === "vuoto")).toHaveLength(1);
    expect(s.filter((x) => x.interventoId === "c2")).toHaveLength(0);
  });

  it("scrive il messaggio del programma", () => {
    const t = testoProgramma("Marco", "domani", [intervento("a", { titolo: "Rossi", inizio: "08:00", indirizzo: "Via Roma 1", persone: ["m", "l"], mezzi: ["d"] })],
      (id) => (id === "m" ? "Marco V." : "Luca B."), () => "Ducato");
    expect(t).toBe("Ciao Marco, domani:\n• 08:00 Rossi\n  Via Roma 1\n  con Luca B.\n  mezzo: Ducato");
  });

  it("una giornata parziale si unisce alla proposta del giorno", () => {
    const proposta: Giornata = { giorno: "d", interventi: [intervento("p1", { orderId: "c1", persone: ["x"] }), intervento("p2", { orderId: "c2" })] };
    const parziale: Giornata = { giorno: "d", parziale: true, interventi: [intervento("f1", { orderId: "c1", persone: ["m"], inizio: "08:00" }), intervento("f2", { tipo: "commissione", orderId: null, titolo: "Ritiro" })] };
    const g = completaConProposta(parziale, proposta);
    expect(g.parziale).toBeUndefined();
    expect(g.interventi.map((i) => i.id)).toEqual(["f1", "p2", "f2"]);
    expect(g.interventi[0].persone).toEqual(["m"]);
  });

  it("un intervento col subappaltatore non è vuoto", () => {
    const g: Giornata = { giorno: "x", interventi: [intervento("c1", { esterni: ["idraulico"] })] };
    expect(avvisi(g, new Set()).some((a) => a.tipo === "vuoto")).toBe(false);
    expect(proponiRiempimento({ giornata: g, persone: [persona("libero")], squadraDi: new Map(), senzaDocumenti: new Set(), puntoDi: () => null })).toEqual([]);
  });

  it("ripetere due volte una commissione non la raddoppia", () => {
    const comm = intervento("x", { tipo: "commissione", orderId: null, titolo: "Ritiro merce" });
    let g: Giornata = { giorno: "d", interventi: [] };
    g = unisciIntervento(g, comm);
    g = unisciIntervento(g, { ...comm, titolo: "ritiro merce " });
    expect(g.interventi).toHaveLength(1);
  });

  it("«stasera in magazzino» non si scontra con la giornata in cantiere", () => {
    const cantiere = intervento("c", { persone: ["m"] });
    const stasera = intervento("s", { tipo: "commissione", momento: "dopo", persone: ["m"] });
    const stamattina = intervento("p", { tipo: "commissione", momento: "prima", persone: ["m"] });
    expect(siSovrappongono(cantiere, stasera)).toBe(false);
    expect(siSovrappongono(stasera, intervento("x", { inizio: "18:00" }))).toBe(false);
    expect(siSovrappongono(stasera, intervento("y", { momento: "dopo" }))).toBe(true);
    expect(avvisi({ giorno: "x", interventi: [cantiere, stasera] }, new Set()).some((a) => a.tipo === "doppio_persona")).toBe(false);
    expect(agendaPersone({ giorno: "x", interventi: [stasera, cantiere, stamattina] }).get("m")!.map((i) => i.id)).toEqual(["p", "c", "s"]);
  });

  it("il capocantiere della commessa fa da capo nella proposta", () => {
    const g = proponiGiornata({
      giorno: "d",
      commesse: [{ id: "c1", codice: null, cliente: "R", descrizione: null, indirizzo: null, inizio: null }],
      persone: [persona("resp", { squadraId: "A", previstoOrderId: "c1" }), persona("capoC", { squadraId: "A", previstoOrderId: "c1" })],
      squadre: [{ id: "A", nome: "A", colore: null, responsabileId: "resp", componenti: ["resp", "capoC"] }],
      mezzi: [],
      capi: new Map([["c1", "capoC"]]),
    });
    expect(g.interventi[0].capoId).toBe("capoC");
  });

  it("propone chi mettere capo quando manca", () => {
    const sq = [{ id: "A", nome: "A", colore: null as string | null, responsabileId: "resp", componenti: ["resp", "x", "y"] }];
    expect(capoMancante(intervento("c", { persone: ["x", "resp"] }), null, sq)).toBe("resp");
    expect(capoMancante(intervento("c", { persone: ["x", "y", "capoC"] }), "capoC", sq)).toBe("capoC");
    expect(capoMancante(intervento("c", { persone: ["x", "y"] }), null, sq)).toBe("x");
    expect(capoMancante(intervento("c", { persone: ["x"] }), null, sq)).toBeNull();
    expect(capoMancante(intervento("c", { persone: ["x", "y"], capoId: "y" }), null, sq)).toBeNull();
  });

  it("sposta tutta la squadra col suo capo", () => {
    const g: Giornata = { giorno: "d", interventi: [intervento("a", { persone: ["x", "y", "z"], capoId: "x" }), intervento("b", { persone: ["k"] })] };
    const r = spostaGruppo(g, ["x", "y"], "a", "b");
    expect(r.interventi[0]).toMatchObject({ persone: ["z"], capoId: null });
    expect(r.interventi[1]).toMatchObject({ persone: ["k", "x", "y"], capoId: "x" });
  });

  it("calendario del giorno: dove finisce un blocco trascinato", () => {
    // Con orario: un'ora più giù.
    expect(orarioDopoTrascinamento(intervento("a", { inizio: "08:00", fine: "10:00" }), PX_ORA, null, null, false)).toEqual({ inizio: "09:00", fine: "11:00", momento: null });
    // Un tocco non sposta.
    expect(orarioDopoTrascinamento(intervento("a", { inizio: "08:00" }), 1, null, null, false)).toBeNull();
    // Senza orario lasciato alle 7:20 della griglia → 7:15–8:15.
    expect(orarioDopoTrascinamento(intervento("b", { momento: "dopo" }), 0, 100 + 80 * (PX_ORA / 60), 100, true)).toEqual({ inizio: "07:15", fine: "08:15", momento: null });
    // Fuori dalla griglia: niente.
    expect(orarioDopoTrascinamento(intervento("b"), 0, 500, 100, false)).toBeNull();
  });

  it("i viaggi del giro: km, minuti, ora di partenza e «non ci arriva»", () => {
    const sede = { lat: 40.85, lng: 14.25 };
    // ~11 km in linea d'aria verso est, poi ~11 km ancora.
    const a = intervento("a", { inizio: "08:00", fine: "10:00", punto: { lat: 40.85, lng: 14.38 } });
    const b = intervento("b", { inizio: "10:10", fine: "12:00", punto: { lat: 40.85, lng: 14.51 } });
    const senza = intervento("c", { inizio: "14:00" });
    const v = viaggiDelGiro([a, b, senza], sede);
    expect(v.tappe[0].km).toBeGreaterThan(13);
    expect(v.tappe[0].km).toBeLessThan(16);
    expect(v.tappe[0].partenza! < "08:00").toBe(true);
    // Da 10:00 a 10:10 non bastano ~20 minuti di strada.
    expect(v.tappe[1].ritardo).toBeGreaterThan(5);
    expect(v.tappe[0].ritardo).toBe(0);
    // Senza posizione: niente km, ma il conto non si rompe.
    expect(v.tappe[2]).toMatchObject({ km: null, minuti: null, ritardo: 0 });
    expect(v.rientroKm).toBeGreaterThan(25);
    expect(v.km).toBeGreaterThan(55);
    expect(viaggiDelGiro([a], null).tappe[0].km).toBeNull();
  });

  it("in trasferta (sede a oltre 150 km) il giro parte dal primo cantiere", () => {
    const milano = { lat: 45.46, lng: 9.19 };
    const a = intervento("a", { inizio: "08:00", punto: { lat: 40.84, lng: 14.25 } });
    const b = intervento("b", { inizio: "11:00", punto: { lat: 40.68, lng: 14.76 } });
    const v = viaggiDelGiro([a, b], milano);
    expect(v.trasferta).toBe(true);
    expect(v.tappe[0].km).toBeNull();
    expect(v.rientroKm).toBeNull();
    expect(v.km).toBeLessThan(100);
  });

  it("la strada vera sostituisce la stima, tratto per tratto, e manca → stima", () => {
    const sede = { lat: 40.85, lng: 14.25 };
    const a = intervento("a", { inizio: "08:00", fine: "10:00", punto: { lat: 40.85, lng: 14.38 } });
    const senza = intervento("x", { inizio: "10:30" });
    const b = intervento("b", { inizio: "10:10", fine: "12:00", punto: { lat: 40.85, lng: 14.51 } });
    // Sede → a → b → sede: tre tratti, la tappa senza posizione non conta.
    expect(puntiDelGiro([a, senza, b], sede)).toEqual([sede, a.punto, b.punto, sede]);
    const v = viaggiDelGiro([a, senza, b], sede, [{ metri: 17_400, secondi: 1_320 }, null, { metri: 30_050, secondi: 1_800 }]);
    expect(v.tappe[0]).toMatchObject({ km: 17.4, minuti: 22, partenza: "07:38" });
    expect(v.tappe[1]).toMatchObject({ km: null, minuti: null });
    // Il secondo tratto manca nella risposta: resta la stima.
    expect(v.tappe[2].km).toBeGreaterThan(13);
    expect(v.tappe[2].km).toBeLessThan(16);
    expect(v.rientroKm).toBe(30.1);
    expect(v.stradale).toBe(false);
    const tutta = viaggiDelGiro([a, b], sede, [{ metri: 17_400, secondi: 1_320 }, { metri: 12_000, secondi: 900 }, { metri: 30_050, secondi: 1_800 }]);
    expect(tutta.stradale).toBe(true);
    expect(tutta.km).toBe(59.5);
    expect(tutta.minuti).toBe(22 + 15 + 30);
    expect(viaggiDelGiro([a, b], sede).stradale).toBe(false);
    expect(puntiDelGiro([senza], sede)).toEqual([]);
  });

  it("in trasferta i punti del giro partono dal primo cantiere, senza sede", () => {
    const milano = { lat: 45.46, lng: 9.19 };
    const a = intervento("a", { punto: { lat: 40.84, lng: 14.25 } });
    const b = intervento("b", { punto: { lat: 40.68, lng: 14.76 } });
    expect(puntiDelGiro([a, b], milano)).toEqual([a.punto, b.punto]);
  });

  it("il giro nel navigatore: partenza, tappe in mezzo (al massimo 9), arrivo", () => {
    expect(linkNavigatore([{ lat: 40.85, lng: 14.25 }])).toBeNull();
    const url = new URL(linkNavigatore([{ lat: 40.85, lng: 14.25 }, { lat: 40.9, lng: 14.3 }, { lat: 40.85, lng: 14.25 }])!);
    expect(url.searchParams.get("origin")).toBe("40.850000,14.250000");
    expect(url.searchParams.get("waypoints")).toBe("40.900000,14.300000");
    expect(url.searchParams.get("destination")).toBe("40.850000,14.250000");
    const tanti = Array.from({ length: 14 }, (_, k) => ({ lat: 40 + k / 100, lng: 14 }));
    expect(new URL(linkNavigatore(tanti)!).searchParams.get("waypoints")!.split("|")).toHaveLength(9);
  });

  it("magazzino nella sede: nessun tratto da zero metri, e l'ora del rientro", () => {
    const sede = { lat: 45.41783, lng: 9.27544 };
    const carico = intervento("c", { momento: "prima", punto: { lat: 45.41785, lng: 9.27546 } });
    const cantiere = intervento("l", { inizio: "07:30", fine: "16:30", punto: { lat: 45.44202, lng: 9.21939 } });
    const scarico = intervento("s", { momento: "dopo", punto: sede });
    // Sede e magazzino sono lo stesso punto: sede → cantiere → sede.
    expect(puntiDelGiro([carico, cantiere, scarico], sede)).toEqual([sede, cantiere.punto, sede]);
    const v = viaggiDelGiro([carico, cantiere, scarico], sede, [{ metri: 6_800, secondi: 900 }, { metri: 7_100, secondi: 960 }]);
    expect(v.tappe[0]).toMatchObject({ km: 0, minuti: 0 });
    expect(v.tappe[1]).toMatchObject({ km: 6.8, minuti: 15, partenza: "07:15" });
    expect(v.tappe[2]).toMatchObject({ km: 7.1, minuti: 16 });
    // L'ultima tappa è già in sede: niente rientro in più.
    expect(v.rientroKm).toBeNull();
    expect(v.stradale).toBe(true);
    // Senza lo scarico, si rientra dal cantiere: 16:30 + 16 minuti.
    const r = viaggiDelGiro([carico, cantiere], sede, [{ metri: 6_800, secondi: 900 }, { metri: 7_100, secondi: 960 }]);
    expect(r.rientroAlle).toBe("16:46");
    expect(r.rientroMinuti).toBe(16);
  });

  it("carico e scarico in magazzino si agganciano al solo cantiere della squadra", () => {
    const carico = intervento("c", { tipo: "commissione", momento: "prima", persone: ["a", "b"] });
    const scarico = intervento("s", { tipo: "commissione", momento: "dopo", persone: ["a"] });
    const cantiere = intervento("k", { inizio: "07:30", persone: ["a", "b", "z"] });
    const altro = intervento("x", { inizio: "08:00", persone: ["q"] });
    const m = commissioniAgganciate([scarico, carico, cantiere, altro]);
    expect(m.get("k")?.map((i) => i.id)).toEqual(["c", "s"]);
    // Le persone stanno in due cantieri: non si indovina, resta da sola.
    const due = commissioniAgganciate([carico, cantiere, intervento("k2", { persone: ["a", "b"] })]);
    expect(due.size).toBe(0);
    // Senza persone o senza momento: niente aggancio.
    expect(commissioniAgganciate([intervento("v", { tipo: "commissione", momento: "prima" }), cantiere]).size).toBe(0);
    expect(commissioniAgganciate([intervento("w", { tipo: "commissione", persone: ["a"] }), cantiere]).size).toBe(0);
  });

  it("cursore dell'ora: in sede, in viaggio lungo la strada, in cantiere, rientrato", () => {
    const sede = { lat: 45.0, lng: 9.0 };
    const cantiere = intervento("k", { inizio: "08:00", fine: "12:00", punto: { lat: 45.2, lng: 9.0 } });
    const punti = puntiDelGiro([cantiere], sede);
    const v = viaggiDelGiro([cantiere], sede, [{ metri: 30_000, secondi: 1_800 }, { metri: 30_000, secondi: 1_800 }]);
    const strada = [[sede, { lat: 45.1, lng: 9.0 }, cantiere.punto!], [cantiere.punto!, sede]];
    const alle = (h: number, m = 0) => doveAlle(v, punti, strada, h * 60 + m)!;
    expect(alle(7, 0)).toMatchObject({ stato: "sede", punto: sede });
    // Parte alle 7:30, a metà strada alle 7:45: sul punto di mezzo della strada.
    const viaggio = alle(7, 45);
    expect(viaggio.stato).toBe("viaggio");
    expect(viaggio.arrivo).toBe("08:00");
    expect(viaggio.intervento?.id).toBe("k");
    expect(viaggio.punto.lat).toBeCloseTo(45.1, 3);
    expect(alle(10)).toMatchObject({ stato: "cantiere", punto: cantiere.punto });
    expect(alle(12, 15)).toMatchObject({ stato: "viaggio", intervento: null, arrivo: "12:30" });
    expect(alle(13)).toMatchObject({ stato: "rientrato", punto: sede });
    expect(doveAlle(v, [], undefined, 600)).toBeNull();
  });
});
