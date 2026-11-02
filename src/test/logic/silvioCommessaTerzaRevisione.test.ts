/**
 * La terza revisione di «Crea con Silvio» (2/11/2026). Dati di prova inventati.
 */
import { describe, expect, it } from "vitest";
import type { Frammento, Modifica, PianoCommessa, Valore } from "../../../shared/silvio-commessa/piano.ts";
import { annulla, applica, fondi, pianoVuoto, type Passo } from "../../../shared/silvio-commessa/fondi.ts";
import { rateInAttesa } from "../../../shared/silvio-commessa/quadratura.ts";
import { eseguiRisposta } from "../../../shared/silvio-commessa/chat.ts";
import { scritturaDalPiano, type ScritturaCommessa } from "@/lib/silvio-commessa/scrittura";
import { conModelloSeMancanoLeFasi, leggiTesto, type ServiziLettura } from "@/lib/silvio-commessa/leggiDocumento";
import { accettaProposte, testoValore } from "@/components/silvio-commessa/presentazione";
import { conConseguenze } from "@/components/silvio-commessa/useBozzaSilvio";

const AZ = "d2000000-0000-4000-a000-000000000002";
const COMMESSA = "d2000000-0000-4000-a000-000000000301";
const OGGI = "2026-11-02";
const uuid = (n: number): string => `${String(n).padStart(8, "0")}-0000-4000-a000-000000000000`;

type Aree = Frammento["aree"];
const fatto = (valore: unknown) => ({ valore, fiducia: 0.95, stato: "fatto" as const });
const proposta = (valore: unknown) => ({ valore, fiducia: 0.7, stato: "proposta" as const });
const frammento = (tipo: Frammento["fonte"]["tipo"], etichetta: string, aree: Aree): Frammento => ({ fonte: { tipo, id: etichetta, etichetta }, aree });

/** Un computo con 3 voci da 3.850 € di costo, su due fasi, già datate. */
const computo = (): Frammento => frammento("computo", "computo via Inventata", {
  cliente: { "cliente.nome": fatto({ client_name: "Condominio Prova" }) },
  fasi: {
    "fasi.work_start_date": proposta("2026-11-09"),
    "fasi.order_work_phases": proposta([
      { name: "Demolizioni", start_date: "2026-11-09", end_date: "2026-11-11", giorni: 3, giorno_inizio: 1,
        sottofasi: [{ name: "Demolizione pavimenti", quantita: 100, unita: "mq", importo: 1500, costo: 900 }] },
      { name: "Murature", start_date: "2026-11-12", end_date: "2026-11-18", giorni: 5, giorno_inizio: 4,
        sottofasi: [
          { name: "Tramezze in laterizio", quantita: 50, unita: "mq", importo: 3000, costo: 1750 },
          { name: "Intonaco civile", quantita: 100, unita: "mq", importo: 2500, costo: 1200 },
        ] },
    ]),
  },
});

const costoVoci = (s: ScritturaCommessa): number =>
  s.fasi.filter((f) => f.origine).flatMap((f) => f.sottofasi).reduce((t, x) => t + (x.costo ?? 0), 0);

function eseguiMods(piano: PianoCommessa, mods: Modifica[], storia: Passo[] = []): { piano: PianoCommessa; storia: Passo[] } {
  let b = { piano, storia };
  for (const m of conConseguenze(b.piano, mods, OGGI)) b = applica(b.piano, m, b.storia, "g");
  return b;
}

describe("1. spostare le date non cancella i costi delle voci", () => {
  it("il computo da solo: 3 voci, 3.850 €", () => {
    const s = scritturaDalPiano(fondi(pianoVuoto(AZ), computo()));
    expect(costoVoci(s)).toBe(3850);
  });

  it("«sposta di una settimana» dalla chat", () => {
    const p = fondi(pianoVuoto(AZ), computo());
    const es = eseguiRisposta(p, [{ nome: "sposta_date", argomenti: { giorni_lavorativi: 5 } }], testoValore, { oggi: OGGI });
    const { piano } = eseguiMods(p, es.modifiche);
    const s = scritturaDalPiano(piano);
    expect(s.fasi[0].inizio).toBe("2026-11-16");
    expect(s.fasi.map((f) => f.origine)).toEqual(["computo", "computo"]);
    expect(costoVoci(s)).toBe(3850);
  });

  it("l'inizio cambiato a mano", () => {
    const p = fondi(pianoVuoto(AZ), computo());
    const { piano } = eseguiMods(p, [{ tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_start_date", valore: "2026-11-16" }]);
    expect(costoVoci(scritturaDalPiano(piano))).toBe(3850);
  });

  it("una fase aggiunta dalla chat", () => {
    const p = fondi(pianoVuoto(AZ), computo());
    const es = eseguiRisposta(p, [{ nome: "aggiungi_fase", argomenti: { nome: "Pulizie", giorni: 1 } }], testoValore, { oggi: OGGI });
    const { piano } = eseguiMods(p, es.modifiche);
    const s = scritturaDalPiano(piano);
    expect(s.fasi).toHaveLength(3);
    expect(costoVoci(s)).toBe(3850);
  });

  it("il «Va bene» sulle fasi", () => {
    const p = fondi(pianoVuoto(AZ), computo());
    const { piano } = eseguiMods(p, accettaProposte(p, ["fasi.order_work_phases"]));
    expect(costoVoci(scritturaDalPiano(piano))).toBe(3850);
  });

  it("«Tieni questo» sul conflitto delle fasi", () => {
    const altra = frammento("documento", "capitolato.pdf", { fasi: { "fasi.order_work_phases": fatto([{ name: "Unica", giorni: 2 }]) } });
    const p = fondi(fondi(pianoVuoto(AZ), computo()), altra);
    expect(p.conflitti.some((c) => c.chiave === "fasi.order_work_phases")).toBe(true);
    const { piano } = applica(p, { tipo: "scegli_fonte", area: "fasi", chiave: "fasi.order_work_phases", fonte: "computo" });
    expect(costoVoci(scritturaDalPiano(piano))).toBe(3850);
  });

  it("spostare due volte, e annullare: l'origine resta", () => {
    const p = fondi(pianoVuoto(AZ), computo());
    let b = applica(p, { tipo: "sposta_date", giorniLavorativi: 5, daFase: null });
    b = applica(b.piano, { tipo: "sposta_date", giorniLavorativi: 1, daFase: null }, b.storia);
    expect(costoVoci(scritturaDalPiano(b.piano))).toBe(3850);
    b = annulla(b.piano, b.storia);
    b = annulla(b.piano, b.storia);
    expect(b.piano.aree.fasi?.["fasi.order_work_phases"]?.fonte.tipo).toBe("computo");
  });

  it("se le voci vengono da un documento che non è un computo, si dice: non spariscono in silenzio", () => {
    const p = fondi(pianoVuoto(AZ), frammento("documento", "capitolato.pdf", {
      fasi: { "fasi.order_work_phases": fatto([{ name: "Murature", giorni: 3, sottofasi: [{ name: "Tramezze", costo: 800 }] }]) },
    }));
    const s = scritturaDalPiano(p);
    expect(costoVoci(s)).toBe(0);
    expect(s.escluse.find((e) => e.chiave === "fasi.order_work_phases")?.motivo).toContain("Murature");
  });

  it("«persi» non conta come scritti i costi di una fase senza origine", () => {
    const p = fondi(pianoVuoto(AZ), frammento("documento", "capitolato.pdf", {
      fasi: { "fasi.order_work_phases": fatto([{ name: "Murature", giorni: 3, sottofasi: [{ name: "Tramezze", costo: 800 }] }]) },
      costi: { "costi.previsti": fatto([{ fase: "Murature", importo: 800 }]) },
    }));
    const s = scritturaDalPiano(p);
    expect(s.escluse.find((e) => e.chiave === "costi.previsti")?.motivo).toContain("Murature");
  });
});

const contratto = (): Frammento => frammento("contratto", "Contratto.pdf", {
  cliente: { "cliente.nome": fatto({ client_name: "Anna Prova" }) },
  economia: { "economia.total_amount": fatto(9000), "economia.vat_rate": fatto(10) },
  pagamenti: { "pagamenti.rate": fatto([
    { label: "Acconto", type: "deposit", amount: 2970, percent: 30, daPercentuale: true },
    { label: "Saldo", type: "balance", amount: 6930, percent: 70, daPercentuale: true },
  ]) },
});

const dallaChat = (piano: PianoCommessa, chiave: string, valore: unknown, storia: Passo[] = []): { piano: PianoCommessa; storia: Passo[] } => {
  const es = eseguiRisposta(piano, [{ nome: "cambia_valore", argomenti: { chiave, valore } }], testoValore, { oggi: OGGI });
  expect(es.modifiche.length).toBeGreaterThan(0);
  return eseguiMods(piano, es.modifiche, storia);
};
const sommaRate = (s: ScritturaCommessa): number => s.rate.reduce((t, r) => t + r.amount, 0);
const TOT = { area: "economia", chiave: "economia.total_amount" } as const;

describe("2. una proposta della chat non porta via il valore di prima", () => {
  it("finché non si conferma valgono importo e rate di prima", () => {
    const { piano } = dallaChat(fondi(pianoVuoto(AZ), contratto()), TOT.chiave, 10000);
    const s = scritturaDalPiano(piano);
    expect(s.ordine.total_amount).toBe(9000);
    expect(sommaRate(s)).toBe(9900);
    expect(s.escluse.filter((e) => e.chiave === TOT.chiave).map((e) => e.motivo)).toEqual(["proposta da confermare"]);
    // La riga mostra la proposta, con «Va bene».
    expect(piano.aree.economia?.[TOT.chiave]?.valore).toBe(10000);
  });

  it("«Toglilo» rimette il valore di prima, con la sua fonte", () => {
    const { piano, storia } = dallaChat(fondi(pianoVuoto(AZ), contratto()), TOT.chiave, 10000);
    const tolto = applica(piano, { tipo: "togli", ...TOT }, storia);
    const v = tolto.piano.aree.economia?.[TOT.chiave];
    expect(v?.valore).toBe(9000);
    expect(v?.fonte.tipo).toBe("contratto");
    expect(sommaRate(scritturaDalPiano(tolto.piano))).toBe(9900);
    // E si può annullare: la proposta torna.
    expect(annulla(tolto.piano, tolto.storia).piano.aree.economia?.[TOT.chiave]?.valore).toBe(10000);
  });

  it("il «Va bene» fa entrare la proposta e rifà le rate", () => {
    const { piano, storia } = dallaChat(fondi(pianoVuoto(AZ), contratto()), TOT.chiave, 10000);
    const b = eseguiMods(piano, accettaProposte(piano, [TOT.chiave]), storia);
    const s = scritturaDalPiano(b.piano);
    expect(s.ordine.total_amount).toBe(10000);
    expect(sommaRate(s)).toBe(11000);
    expect(b.piano.aree.economia?.[TOT.chiave]?.alPostoDi).toBeUndefined();
  });

  it("due proposte di fila: togliendo si torna al valore vero, non alla prima proposta", () => {
    const a = dallaChat(fondi(pianoVuoto(AZ), contratto()), TOT.chiave, 10000);
    const b = dallaChat(a.piano, TOT.chiave, 12000, a.storia);
    expect(applica(b.piano, { tipo: "togli", ...TOT }, b.storia).piano.aree.economia?.[TOT.chiave]?.valore).toBe(9000);
  });

  it("vale per l'IVA", () => {
    const { piano } = dallaChat(fondi(pianoVuoto(AZ), contratto()), "economia.vat_rate", 22);
    const s = scritturaDalPiano(piano);
    expect(s.ordine.vat_rate).toBe(10);
    expect(sommaRate(s)).toBe(9900);
    expect(applica(piano, { tipo: "togli", area: "economia", chiave: "economia.vat_rate" }).piano.aree.economia?.["economia.vat_rate"]?.valore).toBe(10);
  });

  it("vale per le altre variabili proposte dalla chat", () => {
    const p = fondi(pianoVuoto(AZ), frammento("contratto", "Contratto.pdf", {
      cliente: { "cliente.nome": fatto({ client_name: "Anna Prova" }) },
      comunicazione: {},
      economia: { "economia.has_building_bonus": fatto(true) },
    }));
    const { piano } = dallaChat(p, "economia.has_building_bonus", false);
    expect(scritturaDalPiano(piano).ordine.has_building_bonus).toBe(true);
    expect(applica(piano, { tipo: "togli", area: "economia", chiave: "economia.has_building_bonus" }).piano.aree.economia?.["economia.has_building_bonus"]?.valore).toBe(true);
  });

  it("le rate non si calcolano su un importo da confermare, anche senza un importo di prima", () => {
    const p = fondi(pianoVuoto(AZ), frammento("documento", "doc.pdf", {
      cliente: { "cliente.nome": fatto({ client_name: "Anna Prova" }) },
      economia: { "economia.vat_rate": fatto(10) },
      pagamenti: { "pagamenti.rate": proposta([{ label: "Acconto", type: "deposit", amount: 0, percent: 100, daPercentuale: true }]) },
    }));
    const { piano } = dallaChat(p, TOT.chiave, 10000);
    const rate = piano.aree.pagamenti?.["pagamenti.rate"]?.valore as { amount: number }[];
    expect(rate[0].amount).toBe(0);
    expect(rateInAttesa(piano)).toContain("totale");
    // Toglierla non lascia un «tolto da te»: l'importo di un documento può ancora entrare.
    const tolto = applica(piano, { tipo: "togli", ...TOT }).piano;
    expect(tolto.aree.economia?.[TOT.chiave]).toBeUndefined();
    const dopo = fondi(tolto, frammento("contratto", "Contratto.pdf", { economia: { "economia.total_amount": fatto(8000) } }));
    expect(dopo.aree.economia?.[TOT.chiave]?.valore).toBe(8000);
  });

  it("una proposta sopra un conflitto non lo chiude: togliendola il conflitto c'è ancora", () => {
    const p = fondi(fondi(pianoVuoto(AZ), contratto()), frammento("documento", "doc.pdf", { economia: { "economia.total_amount": fatto(9500) } }));
    expect(p.conflitti).toHaveLength(1);
    const { piano } = dallaChat(p, TOT.chiave, 10000);
    expect(piano.conflitti).toHaveLength(1);
    const tolto = applica(piano, { tipo: "togli", ...TOT }).piano;
    expect(tolto.conflitti).toHaveLength(1);
    expect(tolto.aree.economia?.[TOT.chiave]?.valore).toBe(9000);
  });

  it("un documento arrivato mentre la proposta è aperta rientra quando la si toglie", () => {
    const base = fondi(pianoVuoto(AZ), frammento("documento", "doc.pdf", { economia: { "economia.total_amount": fatto(9000) } }));
    const { piano } = dallaChat(base, TOT.chiave, 10000);
    const conContratto = fondi(piano, frammento("contratto", "Contratto.pdf", { economia: { "economia.total_amount": fatto(9500) } }));
    expect(conContratto.aree.economia?.[TOT.chiave]?.valore).toBe(10000);
    const b = applica(conContratto, { tipo: "togli", ...TOT });
    expect(b.piano.conflitti.map((c) => c.chiave)).toEqual([TOT.chiave]);
    const indietro = annulla(b.piano, b.storia).piano;
    expect(indietro.aree.economia?.[TOT.chiave]?.valore).toBe(10000);
    expect(indietro.conflitti).toHaveLength(0);
    expect(indietro.scartati?.map((s) => s.valore.valore)).toEqual([9500]);
  });
});

describe("3. la data del frammento arriva alle fasi del modello", () => {
  const frBagno = (inizio: string | null): Frammento => frammento("testo", "testo scritto", {
    identita: { "identita.description": proposta("Rifacimento bagno 6 mq") },
    ...(inizio ? { fasi: { "fasi.work_start_date": proposta(inizio) } } : {}),
  });
  const fasiDi = (frs: Frammento[]): { name: string; start_date?: string | null }[] =>
    (frs[1]?.aree.fasi?.["fasi.order_work_phases"]?.valore ?? []) as { name: string; start_date?: string | null }[];

  it("senza `opz.inizio` le fasi partono dalla data del frammento", () => {
    const fasi = fasiDi(conModelloSeMancanoLeFasi(frBagno("2026-11-16"), null));
    expect(fasi.length).toBeGreaterThan(0);
    expect(fasi[0].start_date).toBe("2026-11-16");
  });

  it("dal testo letto: la scrittura ha le date delle fasi", async () => {
    const servizi: ServiziLettura = {
      carica: async () => undefined,
      invoca: async () => ({ frammento: frBagno("2026-11-16") }),
      leggiComputo: async () => { throw new Error("non serve"); },
      primeRighe: async () => "",
    };
    const esito = await leggiTesto("bagno 6 mq, si parte il 16/11/2026", { companyId: AZ, userId: uuid(1) }, servizi);
    let p = pianoVuoto(AZ);
    for (const fr of esito.frammenti) p = fondi(p, fr);
    const s = scritturaDalPiano(p);
    const accettate = eseguiMods(p, accettaProposte(p, s.escluse.map((e) => e.chiave))).piano;
    expect(scritturaDalPiano(accettate).fasi.every((f) => !!f.inizio)).toBe(true);
    expect(scritturaDalPiano(accettate).ordine.work_start_date).toBe("2026-11-16");
  });

  it("`opz.inizio` ha la precedenza; una data che non è una data non si usa", () => {
    expect(fasiDi(conModelloSeMancanoLeFasi(frBagno("2026-11-16"), "2026-12-01"))[0].start_date).toBe("2026-12-01");
    expect(fasiDi(conModelloSeMancanoLeFasi(frBagno("2026-13-45"), null))[0].start_date ?? null).toBeNull();
  });
});

describe("4. le esclusioni dicono se sono parziali", () => {
  const dip = (n: number, stato: "proposta" | "attenzione") => ({ employee_id: uuid(n), nome: `Persona ${n}`, fase: "Murature", stato, avviso: stato === "attenzione" ? "è in ferie" : null });

  it("una persona ⚠ e una no: parziale; tutte ⚠: totale", () => {
    const conSquadra = (lista: unknown[]): ScritturaCommessa => {
      const p = fondi(pianoVuoto(AZ), frammento("stima", "Silvio", { persone: { "persone.squadra": proposta(lista) } }));
      return scritturaDalPiano(eseguiMods(p, accettaProposte(p, ["persone.squadra"])).piano);
    };
    const una = conSquadra([dip(1, "proposta"), dip(2, "attenzione")]);
    expect(una.squadra).toHaveLength(1);
    expect(una.escluse.find((e) => e.chiave === "persone.squadra")?.parziale).toBe(true);
    const tutte = conSquadra([dip(2, "attenzione")]);
    expect(tutte.squadra).toHaveLength(0);
    expect(tutte.escluse.find((e) => e.chiave === "persone.squadra")?.motivo).toContain("in ferie");
    expect(tutte.escluse.find((e) => e.chiave === "persone.squadra")?.parziale).toBeUndefined();
  });

  it("una proposta da confermare sopra un valore che entra è parziale; senza valore di prima è totale", () => {
    const { piano } = dallaChat(fondi(pianoVuoto(AZ), contratto()), TOT.chiave, 10000);
    expect(scritturaDalPiano(piano).escluse.find((e) => e.chiave === TOT.chiave)?.parziale).toBe(true);
    const p = fondi(pianoVuoto(AZ), frammento("testo", "t", { cliente: { "cliente.nome": fatto({ client_name: "Anna" }) } }));
    const sola = scritturaDalPiano(dallaChat(p, TOT.chiave, 10000).piano).escluse.find((e) => e.chiave === TOT.chiave);
    expect(sola?.motivo).toBe("proposta da confermare");
    expect(sola?.parziale).toBeUndefined();
  });

  it("le fasi senza date in «completa»: lo si dice, le date non entrano", () => {
    const p = fondi(pianoVuoto(AZ, COMMESSA), frammento("persona", "commessa", {}));
    const con: PianoCommessa = { ...p, aree: { fasi: { "fasi.date_fasi": { valore: [{ name: "Demolizioni", giorni: 2, giorno_inizio: 1 }], fonte: { tipo: "persona", etichetta: "accettato" }, fiducia: 1, stato: "fatto" } as Valore } } };
    const s = scritturaDalPiano(con);
    expect(s.date_fasi).toHaveLength(0);
    const esclusa = s.escluse.find((e) => e.chiave === "fasi.date_fasi");
    expect(esclusa?.motivo).toContain("inizio lavori");
    expect(esclusa?.parziale).toBeUndefined();
  });
});

describe("5. gli indirizzi: la sigla è solo quella finale", () => {
  const ind = (tipo: Frammento["fonte"]["tipo"], etichetta: string, testo: string): Frammento =>
    frammento(tipo, etichetta, { cantiere: { "cantiere.indirizzo": fatto({ indirizzo_lavori: testo }) } });
  const conflitti = (a: Frammento, b: Frammento): number => fondi(fondi(pianoVuoto(AZ), a), b).conflitti.length;

  it.each([
    ["Via XX Settembre 3", "Via XI Settembre 3"],
    ["Via Po 3", "Via Ca 3"],
    ["Via Po", "Via Ca"],
  ])("«%s» e «%s» sono due indirizzi", (a, b) => {
    expect(conflitti(ind("contratto", "c", a), ind("documento", "d", b))).toBe(1);
  });

  it.each([
    ["Via Roma 1, Milano MI", "Via Roma 1 Milano"],
    ["Via Roma 1, 20121 Milano (MI)", "Via Roma 1 - Milano"],
    ["Via Po 3 Torino (TO)", "via po 3, torino"],
  ])("«%s» e «%s» sono lo stesso indirizzo", (a, b) => {
    expect(conflitti(ind("contratto", "c", a), ind("documento", "d", b))).toBe(0);
  });

  it("il più fidato dice meno: conflitto", () => {
    expect(conflitti(ind("contratto", "c", "Via Roma"), ind("documento", "d", "Via Roma 5, Bari"))).toBe(1);
  });

  it("il più fidato dice di più: nessun conflitto, resta il suo", () => {
    const p = fondi(fondi(pianoVuoto(AZ), ind("contratto", "c", "Via Roma 5, Bari")), ind("documento", "d", "Via Roma"));
    expect(p.conflitti).toHaveLength(0);
    expect(p.aree.cantiere?.["cantiere.indirizzo"]?.valore).toEqual({ indirizzo_lavori: "Via Roma 5, Bari" });
  });

  it("il meno fidato aggiunge solo il CAP e la provincia: non è un disaccordo", () => {
    expect(conflitti(ind("contratto", "c", "Via Roma 5 Bari"), ind("documento", "d", "Via Roma 5, 70121 Bari (BA)"))).toBe(0);
  });
});

describe("7. le rate che aspettano l'IVA", () => {
  it("non dice «confermale così», che il popup non permette", () => {
    const p = fondi(pianoVuoto(AZ), frammento("documento", "doc.pdf", {
      economia: { "economia.total_amount": fatto(10000) },
      pagamenti: { "pagamenti.rate": proposta([{ label: "Acconto", type: "deposit", amount: 3000, percent: 30, daPercentuale: true }]) },
    }));
    expect(rateInAttesa(p)).toContain("IVA");
    expect(rateInAttesa(p)).not.toContain("confermale");
  });
});

describe("8. su una commessa che c'è, quello che Silvio aggiunge si conferma", () => {
  const conCommessa = (): PianoCommessa => fondi(pianoVuoto(AZ, COMMESSA), {
    fonte: { tipo: "persona", id: COMMESSA, etichetta: "commessa O-0301" },
    aree: {
      cliente: {
        "cliente.nome": fatto({ client_name: "Mario Cliente" }),
        "cliente.contatto": fatto({ client_phone: "3331234567" }),
      },
    },
  });

  it("la colonna che manca è una proposta: non entra da sola, col «Va bene» sì", () => {
    const p = fondi(conCommessa(), frammento("documento", "doc.pdf", {
      cliente: { "cliente.contatto": fatto({ client_phone: "3331234567", client_email: "mario@example.test" }) },
    }));
    const v = p.aree.cliente?.["cliente.contatto"];
    expect(v?.nota).toContain("te lo propongo");
    expect(v?.daConfermare).toBe(true);
    const s = scritturaDalPiano(p);
    expect(s.ordine.client_email).toBeUndefined();
    expect(s.escluse.find((e) => e.chiave === "cliente.contatto")?.motivo).toBe("proposta da confermare");

    const ok = eseguiMods(p, accettaProposte(p, ["cliente.contatto"])).piano;
    const dopo = scritturaDalPiano(ok);
    expect(dopo.ordine.client_email).toBe("mario@example.test");
    expect(dopo.ordine.client_phone).toBeUndefined();
  });

  it("il secondo documento non fa passare la proposta senza conferma", () => {
    const uno = fondi(conCommessa(), frammento("documento", "doc.pdf", {
      cliente: { "cliente.contatto": fatto({ client_email: "mario@example.test" }) },
    }));
    const due = fondi(uno, frammento("contratto", "Contratto.pdf", {
      cliente: { "cliente.contatto": fatto({ client_email: "mario@example.test" }) },
    }));
    expect(scritturaDalPiano(due).ordine.client_email).toBeUndefined();
  });

  it("una variabile che la commessa non ha affatto resta come prima: non promette niente e entra con «Completa»", () => {
    const p = fondi(conCommessa(), frammento("contratto", "Contratto.pdf", { economia: { "economia.vat_rate": fatto(10) } }));
    expect(p.aree.economia?.["economia.vat_rate"]?.nota ?? "").not.toContain("propongo");
    expect(scritturaDalPiano(p).ordine.vat_rate).toBe(10);
  });
});
