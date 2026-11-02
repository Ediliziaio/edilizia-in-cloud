/**
 * Le ultime correzioni del popup «Crea con Silvio» (2/11/2026): il «Controlla» dice cosa entra
 * davvero, i conti leggono il valore in vigore, gli importi hanno le migliaia e i costi restano
 * a chi ha il permesso. Dati di prova inventati.
 */
import { describe, expect, it } from "vitest";
import { applica, fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import type { Frammento, PianoCommessa, Valore } from "../../../shared/silvio-commessa/piano.ts";
import { controlliQuadratura } from "../../../shared/silvio-commessa/quadratura.ts";
import { eseguiRisposta, pianoPerLaChat, type ChiamataStrumento } from "../../../shared/silvio-commessa/chat.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
import { azioneInParole } from "@/lib/silvio-commessa/pianoVolo";
import {
  contiDellaBarra, cosaDecidere, domandaDiSilvio, elencoControlla, fineLavori, importoNascosto, margineDaMostrare, marginePrevisto,
  riservataPerProfilo, testoConferma, testoValore, vistaPerLaChat, type RigaArea,
} from "@/components/silvio-commessa/presentazione";
import { pianoSenzaFonte } from "@/components/silvio-commessa/useBozzaSilvio";
import type { Autonomia } from "../../../shared/silvio-commessa/autonomia.ts";
import type { ComputoStrutturato } from "@/lib/computo/computoStrutturato";
import { frammentoDaFileComputo } from "@/lib/silvio-commessa/lettori/computo";
import { variabile } from "../../../shared/silvio-commessa/registro.ts";

const AZ = "d2000000-0000-4000-a000-000000000002";
const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-a000-000000000000`;
const fatto = (valore: unknown) => ({ valore, fiducia: 1, stato: "fatto" as const });
const proposta = (valore: unknown) => ({ valore, fiducia: 0.7, stato: "proposta" as const });
const fr = (aree: Frammento["aree"], etichetta = "preventivo PR-1", id = "q1"): Frammento => ({ fonte: { tipo: "preventivo", id, etichetta }, aree });
const voce = (p: PianoCommessa, chiave: string, ...vede: [boolean?, boolean?]) => {
  const s = scritturaDalPiano(p);
  return elencoControlla(p, s, ...vede).flatMap((g) => g.voci).find((v) => v.chiave === chiave);
};

const FASI = [
  { name: "Demolizioni", start_date: "2030-01-07", end_date: "2030-01-09", sottofasi: [{ name: "Pavimenti", quantita: 1, importo: 2000, costo: 1200 }] },
  { name: "Impianti", start_date: "2030-01-10", end_date: "2030-01-18", sottofasi: [{ name: "Tubi", quantita: 1, importo: 3000 }] },
];

describe("1. Controlla: un elemento entra e l'altro no", () => {
  const dueSquadra = fr({
    persone: { "persone.squadra": fatto([
      { employee_id: uuid(1), nome: "Mario", fase: null as string | null, stato: "proposta" },
      { employee_id: uuid(2), nome: "Luca", fase: null as string | null, stato: "attenzione", avviso: "è in ferie" },
    ]) },
  });

  it("due persone con una ⚠: la voce entra in parte e dice chi resta fuori", () => {
    const v = voce(fondi(pianoVuoto(AZ), dueSquadra), "persone.squadra")!;
    expect(v.parziale).toBe(true);
    expect(v.fuori).toMatch(/Luca/);
  });

  it("due persone con ⚠ diverse: si leggono tutte e due, la Map ne teneva una", () => {
    const p = fondi(pianoVuoto(AZ), fr({
      persone: { "persone.squadra": fatto([
        { employee_id: uuid(1), nome: "Mario", fase: null as string | null, stato: "attenzione", avviso: "è in malattia" },
        { employee_id: uuid(2), nome: "Luca", fase: null as string | null, stato: "attenzione", avviso: "è in ferie" },
      ]) },
    }));
    const v = voce(p, "persone.squadra")!;
    expect(v.fuori).toMatch(/Mario/);
    expect(v.fuori).toMatch(/Luca/);
    // Nessuno dei due entra: non è «in parte».
    expect(v.parziale).toBeUndefined();
  });

  it("una voce che entra in parte conta tra le pronte della barra", () => {
    const p = fondi(pianoVuoto(AZ), dueSquadra);
    expect(contiDellaBarra(p, scritturaDalPiano(p), 0).pronte).toBe(1);
  });
});

describe("1. Controlla: due ordini, uno sopra la soglia", () => {
  it("con «da sola» il primo entra, l'altro aspetta", () => {
    const autonomia: Autonomia = { ordini: { livello: "da_sola", soglia_eur: 500 } };
    const ordine = (id: number, fornitore: string, prezzo: number) => ({ supplier_id: uuid(id), fornitore, fase: "Posa", righe: [{ descrizione: "Materiale", quantita: 10, prezzo }] });
    const p = fondi(pianoVuoto(AZ), fr({ materiali: { "materiali.acquisti": proposta([ordine(1, "Piccolo", 8), ordine(2, "Grande", 900)]) } }));
    const s = scritturaDalPiano(p, autonomia);
    expect(s.oda).toHaveLength(1);
    const v = elencoControlla(p, s).flatMap((g) => g.voci).find((x) => x.chiave === "materiali.acquisti")!;
    expect(v.parziale).toBe(true);
    expect(v.fuori).toMatch(/Grande/);
    expect(v.fuori).not.toMatch(/Piccolo/);
  });
});

describe("2. La fine lavori segue le fasi", () => {
  const conFine = (fine: string) => fondi(pianoVuoto(AZ), fr({
    fasi: { "fasi.order_work_phases": fatto(FASI), "fasi.work_end_date": proposta(fine) },
  }));

  it("la proposta non confermata non «resta fuori»: la fine viene dalle fasi", () => {
    const p = conFine("2030-03-01");
    const v = voce(p, "fasi.work_end_date")!;
    expect(v.fuori).toBeNull();
    expect(v.testo).toBe("18 gen 2030");
    expect(v.nota).toMatch(/segue le fasi/);
    expect(v.nota).toMatch(/1 mar 2030/);
    expect(fineLavori(p, scritturaDalPiano(p))).toBe("2030-01-18");
  });

  it("senza nessuna fine proposta, la voce c'è lo stesso: quella data verrà scritta", () => {
    const p = fondi(pianoVuoto(AZ), fr({ fasi: { "fasi.order_work_phases": fatto(FASI) } }));
    expect(voce(p, "fasi.work_end_date")).toMatchObject({ testo: "18 gen 2030", fuori: null });
    expect(voce(p, "fasi.work_start_date")).toMatchObject({ testo: "7 gen 2030", fuori: null });
  });

  it("senza fasi datate la proposta resta davvero fuori", () => {
    const p = fondi(pianoVuoto(AZ), fr({ fasi: { "fasi.work_end_date": proposta("2030-03-01") } }));
    expect(voce(p, "fasi.work_end_date")?.fuori).toBe("proposta da confermare");
  });

  it("la riga dice cosa succede se non la confermi", () => {
    const riga = { variabile: variabile("fasi.work_end_date")!, valore: conFine("2030-03-01").aree.fasi!["fasi.work_end_date"], conflitto: null as RigaArea["conflitto"], stato: "proposta" } as RigaArea;
    expect(testoConferma(riga, null, { fineDalleFasi: "2030-01-18" })).toMatch(/segue le fasi: 18 gen 2030/);
  });

  it("i costi delle voci entrano con le fasi: il Controlla li mostra", () => {
    const p = fondi(pianoVuoto(AZ), fr({ fasi: { "fasi.order_work_phases": fatto(FASI) } }));
    expect(voce(p, "costi.previsti")).toMatchObject({ testo: expect.stringMatching(/^1\.200\s€$/), fuori: null });
  });
});

describe("3. Conti e Controlla leggono il valore in vigore", () => {
  const base = () => fondi(pianoVuoto(AZ), fr({
    economia: { "economia.total_amount": fatto(9000) },
    costi: { "costi.previsti": fatto([{ fase: "Demolizioni", importo: 3000, vociSenzaCosto: 0 }]) },
  }));
  const conProposta = (p: PianoCommessa) => applica(p, { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 10000, proposta: true }).piano;

  it("il margine non cambia finché la proposta non è confermata", () => {
    expect(marginePrevisto(conProposta(base()))).toEqual({ euro: 6000, percento: 67 });
  });

  it("una proposta senza niente sotto non fa un margine", () => {
    const p = applica(pianoVuoto(AZ), { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 10000, proposta: true }).piano;
    expect(marginePrevisto({ ...p, aree: { ...p.aree, costi: base().aree.costi } })).toBeNull();
  });

  it("il Controlla mostra quello che entra e la proposta al suo posto", () => {
    const v = voce(conProposta(base()), "economia.total_amount")!;
    expect(v.testo).toMatch(/^9\.000\s€$/);
    expect(v.fuori).toBeNull();
    expect(v.nota).toMatch(/proposta 10\.000\s€ al posto di 9\.000\s€/);
    const nascosta = voce(conProposta(base()), "economia.total_amount", false)!;
    expect(`${nascosta.testo} ${nascosta.nota ?? ""}`).not.toMatch(/\d/);
  });

  it("tolta la fonte, sotto la proposta non resta il suo valore", () => {
    const { piano, tolti } = pianoSenzaFonte(conProposta(base()), [{ id: "q1", etichetta: "preventivo PR-1" }]);
    const v = piano.aree.economia!["economia.total_amount"];
    expect(v.valore).toBe(10000);
    expect(v.alPostoDi).toBeNull();
    expect(tolti).toBeGreaterThanOrEqual(2);
    // «Toglilo» non rimette il documento tolto.
    expect(applica(piano, { tipo: "togli", area: "economia", chiave: "economia.total_amount" }).piano.aree.economia?.["economia.total_amount"]).toBeUndefined();
  });

  it("tolta un'altra fonte, sotto la proposta resta il valore che c'era", () => {
    const { piano } = pianoSenzaFonte(conProposta(base()), [{ id: "x", etichetta: "altro.pdf" }]);
    expect((piano.aree.economia!["economia.total_amount"].alPostoDi as Valore).valore).toBe(9000);
  });

  it("con le fonti in disaccordo la proposta resta, e sotto va quella rimasta", () => {
    const due = fondi(base(), fr({ economia: { "economia.total_amount": fatto(8000) } }, "Contratto.pdf", "c1"));
    expect(due.conflitti).toHaveLength(1);
    const { piano } = pianoSenzaFonte(conProposta(due), [{ id: "c1", etichetta: "Contratto.pdf" }]);
    const v = piano.aree.economia!["economia.total_amount"];
    expect(v.valore).toBe(10000);
    expect((v.alPostoDi as Valore).valore).toBe(9000);
    expect(piano.conflitti).toHaveLength(0);
  });
});

describe("4. Il margine con i costi parziali non sembra un risultato", () => {
  const conFasi = (fasi: unknown, importo = 48500) => fondi(pianoVuoto(AZ), fr({
    economia: { "economia.total_amount": fatto(importo) }, fasi: { "fasi.order_work_phases": fatto(fasi) },
  }));

  it("una fase senza costi: si dicono i costi e cosa manca, nessuna percentuale", () => {
    const m = margineDaMostrare(conFasi(FASI))!;
    expect(m).toEqual({ parziale: true, costi: 1200, mancano: "manca 1 fase su 2" });
    expect(JSON.stringify(m)).not.toMatch(/percento/);
  });

  it("le voci senza costo contano anche dentro una fase che ne ha", () => {
    const fasi = [{ name: "A", sottofasi: [{ name: "x", costo: 1000 }, { name: "y" }, { name: "z" }] }];
    expect(margineDaMostrare(conFasi(fasi, 3000))).toMatchObject({ parziale: true, mancano: "mancano 2 voci" });
  });

  it("ogni voce ha un costo ma il margine è 98 %: non è credibile", () => {
    const fasi = [{ name: "A", sottofasi: [{ name: "x", costo: 900 }] }];
    expect(margineDaMostrare(conFasi(fasi))).toMatchObject({ parziale: true, costi: 900 });
  });

  it("i costi completi danno il margine", () => {
    const fasi = [{ name: "A", sottofasi: [{ name: "x", costo: 30000 }] }];
    expect(margineDaMostrare(conFasi(fasi))).toEqual({ parziale: false, euro: 18500, percento: 38 });
  });
});

describe("5. Gli importi dei testi hanno le migliaia", () => {
  it("la quadratura delle rate", () => {
    const p = fondi(pianoVuoto(AZ), fr({
      economia: { "economia.total_amount": fatto(4000), "economia.vat_rate": fatto(10) },
      pagamenti: { "pagamenti.rate": fatto([{ label: "Saldo", type: "balance", amount: 4190 }]) },
    }));
    expect(controlliQuadratura(p)[0].testo).toMatch(/Le rate fanno 4\.190,00 €, il totale con l'IVA è 4\.400,00 €/);
  });

  it("l'imponibile e l'ivato nella nota del disaccordo", () => {
    const p = fondi(fondi(pianoVuoto(AZ), fr({
      economia: { "economia.total_amount": fatto(5000), "economia.vat_rate": fatto(10) },
    })), fr({ economia: { "economia.total_amount": fatto(5500) } }, "Contratto.pdf", "c1"));
    expect(p.conflitti[0].nota).toMatch(/5\.500 € è 5\.000 € più l'IVA/);
  });

  it("il totale del computo che non torna", () => {
    const voce = { numero_ordine: "1", descrizione: "Tramezze", unita: "mq", quantita: 1, prezzo_unitario: 1000, importo: 1000, misure: [] as unknown[], codici: [] as string[] };
    const computo = { voci: [voce], totale_dichiarato: 4190, avvisi: [] as string[] } as unknown as ComputoStrutturato;
    expect(frammentoDaFileComputo(computo, "computo.xpwe").avvisi?.join(" ")).toMatch(/4\.190,00 €/);
  });

  it("il SAL in bozza del piano di volo", () => {
    expect(azioneInParole({ tipo: "sal_bozza", numero: 1, importo: 4190 } as Parameters<typeof azioneInParole>[0])).toMatch(/4\.190,00/);
  });
});

describe("6. I costi restano a chi ha il permesso", () => {
  const ditta = { external_team_id: uuid(5), nome: "Edil Rossi", fase: "Demolizioni", costo_previsto: 7777, stato: "proposta" };
  const contratto = {
    external_team_id: uuid(5), nome: "Edil Rossi", subappaltatore_id: null as string | null, fasi: ["Demolizioni"], dal: null as string | null, al: null as string | null, importo: 8888,
    elenco: [{ fase: "Demolizioni", descrizione: "Rimozione", unita: "mq", quantita: 2, prezzo: 4444, importo: 8888, codice: null as string | null }], stato: "proposta",
  };
  const oda = { supplier_id: uuid(6), fornitore: "Forniture Bianchi", fase: null as string | null, data_consegna: null as string | null, data_ordine: null as string | null, giorni_consegna: null as string | null, stato: "proposta", righe: [{ descrizione: "Cemento", quantita: 1, prezzo: 6666 }] };
  const p = fondi(pianoVuoto(AZ), fr({
    economia: { "economia.total_amount": fatto(48500) },
    fasi: { "fasi.order_work_phases": fatto([{ name: "Demolizioni", start_date: "2030-01-07", end_date: "2030-01-09", sottofasi: [{ name: "Pavimenti", quantita: 1, importo: 3333, costo: 5555 }] }]) },
    costi: { "costi.previsti": fatto([{ fase: "Demolizioni", importo: 5555, vociSenzaCosto: 0 }]) },
    ditte: { "ditte.assegnate": fatto([ditta]), "ditte.contratti": fatto([contratto]) },
    materiali: { "materiali.acquisti": fatto([oda]) },
  }));
  const CIFRE = /5\.?555|7\.?777|8\.?888|4\.?444|6\.?666/;

  it("«Importi di vendita» non basta: senza il permesso sui costi le ditte non dicono quanto costano", () => {
    expect(importoNascosto("costi.previsti", true, false)).toBe(true);
    expect(testoValore("ditte.assegnate", [ditta], false)).toBe("1 ditta: Edil Rossi");
    expect(testoValore("ditte.contratti", [contratto], false)).toBe("1 contratto in bozza: Edil Rossi");
    expect(testoValore("ditte.assegnate", [ditta])).toMatch(/7\.777/);
  });

  it("il Controlla non dice i costi, nemmeno nei motivi", () => {
    const scrittura = scritturaDalPiano(p);
    const testo = JSON.stringify(elencoControlla(p, scrittura, true, false));
    expect(testo).not.toMatch(CIFRE);
    expect(testo).toMatch(/Edil Rossi/);
    expect(JSON.stringify(elencoControlla(p, scrittura))).toMatch(/5\.555/);
    const conMotivo = { ...scrittura, escluse: [{ chiave: "ditte.contratti", etichetta: "Contratti", motivo: "Contratti e ordini fanno 8.888,00 €, più dell'imponibile" }] };
    expect(JSON.stringify(elencoControlla(p, conMotivo, true, false))).not.toMatch(CIFRE);
  });

  it("Da decidere e la domanda di Silvio non dicono i costi di due fonti in disaccordo", () => {
    const altra = fr({ ditte: { "ditte.assegnate": fatto([{ ...ditta, costo_previsto: 1111 }, { ...ditta, external_team_id: uuid(7), nome: "Altra srl", costo_previsto: 2222 }]) } }, "Offerta.pdf", "o1");
    const due = fondi(p, altra);
    expect(due.conflitti.map((c) => c.chiave)).toContain("ditte.assegnate");
    const s = scritturaDalPiano(due);
    expect(JSON.stringify(domandaDiSilvio(due, s, new Date(), true, false))).not.toMatch(/7\.777|1\.111|2\.222/);
    const avvisi = { ...due, avvisi: ["Offerta.pdf: totale 7.777 €"] };
    expect(cosaDecidere(avvisi, s, undefined, { vedeCosti: false }).avvisi).toEqual([]);
    expect(cosaDecidere(avvisi, s).avvisi).toHaveLength(1);
  });

  it("la chat AI non riceve i costi, ma riceve i nomi", () => {
    const contesto = JSON.stringify(pianoPerLaChat(vistaPerLaChat(p, true, false), "2030-01-01"));
    expect(contesto).not.toMatch(/5555|7777|8888|4444|6666/);
    expect(contesto).toMatch(/Edil Rossi/);
    expect(contesto).toMatch(/48500/);
    // Il piano vero resta intero: è lui che si scrive.
    expect(JSON.stringify(p)).toMatch(/5555/);
  });

  it("senza gli importi di vendita la chat non riceve nemmeno il venduto delle voci", () => {
    const contesto = JSON.stringify(pianoPerLaChat(vistaPerLaChat(p, false, true), "2030-01-01"));
    expect(contesto).not.toMatch(/48500|3333/);
    expect(contesto).toMatch(/5555/);
  });

  const risponde = (piano: PianoCommessa, strumento: ChiamataStrumento, vedeImporti = true, vedeCosti = false) =>
    eseguiRisposta(piano, [strumento], (c, x) => testoValore(c, x, vedeCosti), { riservata: (c) => riservataPerProfilo(c, vedeImporti, vedeCosti) });

  it("«spiega» non rivela il costo con il testo citato dal documento", () => {
    const citato: Frammento = {
      fonte: { tipo: "offerta", id: "o1", etichetta: "Offerta.pdf", citazione: "totale 7.777 €" },
      aree: { ditte: { "ditte.assegnate": fatto([ditta]) } },
    };
    const conCitazione = fondi(pianoVuoto(AZ), citato);
    const e = risponde(conCitazione, { nome: "spiega", argomenti: { chiave: "ditte.assegnate" } });
    expect(e.righe[0]).toMatch(/Offerta\.pdf/);
    expect(e.righe[0]).not.toMatch(/7\.777/);
  });

  it("la chat non scrive e non spiega quello che chi scrive non vede", () => {
    const e = risponde(p, { nome: "cambia_valore", argomenti: { chiave: "costi.previsti", valore: [] } });
    expect(e.rifiuti).toBe(1);
    expect(e.modifiche).toEqual([]);
    expect(e.righe[0]).toMatch(/non è visibile/);
    expect(risponde(p, { nome: "cambia_valore", argomenti: { chiave: "ditte.assegnate", valore: [] } }).rifiuti).toBe(1);
    const altra = fondi(p, fr({ economia: { "economia.total_amount": fatto(40000) } }, "Contratto.pdf", "c1"));
    const importo = risponde(altra, { nome: "spiega", argomenti: { chiave: "economia.total_amount" } }, false, true);
    expect(importo.righe[0]).toMatch(/Contratto\.pdf/);
    expect(importo.righe[0]).not.toMatch(/48\.500|40\.000/);
  });

  it("togliere una ditta dalla chat resta possibile, e la risposta non dice la cifra", () => {
    const e = risponde(p, { nome: "togli", argomenti: { chiave: "ditte.assegnate", elemento: "Edil Rossi" } });
    expect(e.rifiuti).toBe(0);
    expect(e.righe[0]).not.toMatch(CIFRE);
  });
});
