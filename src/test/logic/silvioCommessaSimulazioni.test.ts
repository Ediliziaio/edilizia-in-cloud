/**
 * I difetti trovati dalle simulazioni di «Crea con Silvio» su Demo Azienda 2 (2/11/2026).
 * Un `describe` per numero. Le funzioni SQL si provano leggendo la migrazione: l'effetto vero
 * sul database si controlla in una transazione annullata, prima di applicarla.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applica, fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { fasiDiLavoro, type MezzoDelPiano } from "../../../shared/silvio-commessa/risorse.ts";
import { riconosciTipoLavoro } from "../../../shared/silvio-commessa/modelliLavoro.ts";
import { avvisiDiRipresa } from "../../../shared/silvio-commessa/quadratura.ts";
import type { Frammento, PianoCommessa } from "../../../shared/silvio-commessa/piano.ts";
import { economiaFasi } from "@/lib/orders/economiaFasi";
import { conModelloSeMancanoLeFasi } from "@/lib/silvio-commessa/leggiDocumento";
import { frammentoDaPreventivo, preventivoConvertibile, preventivoFirmato } from "@/lib/silvio-commessa/lettori";
import { prontaPerScrivere, scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
import {
  domandaDiSilvio, elencoControlla, margineDaMostrare, restatoFuori, rifiutoInParole, testoValore,
} from "@/components/silvio-commessa/presentazione";

const MIGRAZIONE = "supabase/migrations/20281112150000_silvio_scrittura_fasi_costi.sql";
const sql = () => (existsSync(MIGRAZIONE) ? readFileSync(MIGRAZIONE, "utf8") : "");
function funzione(nome: string): string {
  const testo = sql();
  const da = testo.indexOf(`create or replace function public.${nome}(`);
  if (da < 0) return "";
  const fine = testo.indexOf("$funzione$;", da);
  return testo.slice(da, fine);
}

const v = (valore: unknown, nota: string | null = null) => ({ valore, fiducia: 1, stato: "fatto" as const, nota });
const frammento = (id: string, aree: Frammento["aree"], tipo: Frammento["fonte"]["tipo"] = "contratto"): Frammento =>
  ({ fonte: { tipo, id, etichetta: `Documento ${id}` }, aree });
const PIANO = () => pianoVuoto("azienda-prova");

const DURATE = [
  { name: "Demolizioni", giorni: 3, giorno_inizio: 1 },
  { name: "Impianto idraulico", giorni: 5, giorno_inizio: 4 },
];

describe("1. costi doppi", () => {
  it("le voci scrivono il costo nel lavoro, non nei materiali", () => {
    const f = funzione("_silvio_aggiungi");
    expect(f).toMatch(/nullif\(v_sotto->>'unita', ''\), v_q,[\s\S]*?case when v_q > 0 then round\(v_costo \/ v_q, 4\) else v_costo end, 0,/);
    expect(f).not.toMatch(/v_q, 0,\s*case when v_q > 0/);
  });

  it("economiaFasi conta 4.450 € e non 8.900, e il popup dice lo stesso margine della commessa", () => {
    const e = economiaFasi({
      fasi: [{ id: "f1", importo_venduto: 10000 }], righe: [],
      assegnazioni: [{ phase_id: "f1", source: "team", cost_preventivo: 4450, cost_consuntivo: 0, vat_rate: 0 }],
      vociPreviste: [{ phase_id: "f1", quantita: 1, costo_manodopera: 4450, costo_materiali: 0 }],
    });
    expect(e.perFase.get("f1")!.costoPrevisto).toBe(4450);

    const piano = fondi(PIANO(), frammento("c1", {
      economia: { "economia.total_amount": v(10000) },
      fasi: { "fasi.order_work_phases": v([{ name: "Impianto idraulico", sottofasi: [{ name: "Tubazioni", quantita: 1, costo: 4450 }] }]) },
    }, "computo"));
    expect(margineDaMostrare(piano)).toEqual({ parziale: false, euro: 10000 - e.perFase.get("f1")!.costoPrevisto, percento: 56 });
  });

  it("il costo previsto della ditta è con la sua IVA, che economiaFasi toglie", () => {
    expect(funzione("_silvio_aggiungi_risorse")).toContain("* (1 + coalesce(v_team.vat_rate, 0) / 100), 2)");
    const e = economiaFasi({
      fasi: [{ id: "f1" }], righe: [],
      assegnazioni: [{ phase_id: "f1", source: "team", cost_preventivo: 4450 * 1.22, cost_consuntivo: 0, vat_rate: 22 }],
    });
    expect(e.perFase.get("f1")!.costoPrevisto).toBe(4450);
  });
});

describe("2. fasi con le durate e senza date", () => {
  const contratto = frammento("c1", {
    fasi: { "fasi.work_start_date": v("2026-11-16"), "fasi.order_work_phases": v(DURATE) },
  });

  it("l'inizio del contratto dà le date alle fasi, e la scrittura le porta", () => {
    const s = scritturaDalPiano(fondi(PIANO(), contratto));
    expect(s.fasi.map((f) => [f.inizio, f.fine])).toEqual([["2026-11-16", "2026-11-18"], ["2026-11-19", "2026-11-25"]]);
  });

  it("segue il calendario dell'azienda", () => {
    const piano: PianoCommessa = { ...PIANO(), calendario: { chiusure: ["2026-11-17"] } };
    const s = scritturaDalPiano(fondi(piano, contratto));
    expect(s.fasi[0]).toMatchObject({ inizio: "2026-11-16", fine: "2026-11-19" });
  });

  it("le risorse vedono le date", () => {
    expect(fasiDiLavoro(fondi(PIANO(), contratto))[0]).toMatchObject({ dal: "2026-11-16", al: "2026-11-18" });
  });

  it("l'inizio può arrivare da un altro documento, e le stesse fasi non fanno un conflitto", () => {
    const soloFasi = frammento("a", { fasi: { "fasi.order_work_phases": v(DURATE) } });
    const soloInizio = frammento("b", { fasi: { "fasi.work_start_date": v("2026-11-16") } });
    const piano = fondi(fondi(PIANO(), soloFasi), soloInizio);
    expect(scritturaDalPiano(piano).fasi[0].inizio).toBe("2026-11-16");
    const dopo = fondi(piano, frammento("c", { fasi: { "fasi.order_work_phases": v(DURATE) } }));
    expect(dopo.conflitti).toEqual([]);
  });

  it("le date che un documento dice non si toccano", () => {
    const piano = fondi(PIANO(), frammento("c1", {
      fasi: {
        "fasi.work_start_date": v("2026-11-16"),
        "fasi.order_work_phases": v([{ name: "Demolizioni", giorni: 3, giorno_inizio: 1, start_date: "2026-12-01", end_date: "2026-12-03" }]),
      },
    }));
    expect(scritturaDalPiano(piano).fasi[0].inizio).toBe("2026-12-01");
  });
});

describe("3. venduto della fase", () => {
  it("è la somma delle voci, se le voci non superano il totale", () => {
    const f = funzione("_silvio_aggiungi");
    expect(f).toContain("set importo_venduto = x.somma");
    expect(f).toContain("round(sum(v.importo), 2)");
    expect(f).toContain("v_somma <= v_totale + 1");
  });
});

describe("4. riconoscimento del lavoro", () => {
  it.each([
    ["Rifacimento facciata", null],
    ["Rifacimento facciata condominio con sostituzione finestre", null],
    ["Cappotto su una villetta a Lodi", null],
    ["Rifacimento cucina", null],
    ["Cucina nuova in appartamento", null],
    ["Tinteggiatura appartamento", null],
    ["Rifacimento", null],
    ["Rifacimento tetto", "tetto"],
    ["Rifacimento bagno", "bagno"],
    ["Sostituzione serramenti", "serramenti"],
    ["Rifacimento pavimenti", "pavimenti"],
    ["Ristrutturazione completa con nuovi serramenti e cappotto", "ristrutturazione"],
    ["Ristrutturazione appartamento con cucina e bagno", "ristrutturazione"],
    ["Ristrutturazione casa", "ristrutturazione"],
    ["Villetta da sistemare", "ristrutturazione"],
  ])("«%s» → %s", (testo, tipo) => {
    expect(riconosciTipoLavoro(testo)).toBe(tipo);
  });
});

describe("5. IVA non detta", () => {
  const piano = fondi(PIANO(), frammento("c1", {
    cliente: { "cliente.nome": v({ client_name: "Mario Rossi" }) },
    economia: { "economia.total_amount": v(10000) },
    fasi: { "fasi.work_start_date": v("2026-11-16") },
    cantiere: { "cantiere.indirizzo": v({ indirizzo_lavori: "Via Prova 1, Monza" }) },
  }));
  const s = scritturaDalPiano(piano);

  it("Silvio la chiede, e dice quale userebbe", () => {
    const d = domandaDiSilvio(piano, s, new Date("2026-11-02T10:00:00Z"));
    expect(d?.testo).toMatch(/IVA/);
    expect(d?.testo).toMatch(/22 %/);
    expect(d?.risposte.map((r) => r.etichetta)).toEqual(["22 %", "10 %", "4 %"]);
  });

  it("il «Controlla» dice quella che entra", () => {
    const voce = elencoControlla(piano, s).flatMap((g) => g.voci).find((x) => x.chiave === "economia.vat_rate");
    expect(voce).toMatchObject({ testo: "22 %", fuori: null, nota: expect.stringMatching(/predefinita/) });
  });

  it("detta da un documento, non si chiede", () => {
    const conIva = fondi(piano, frammento("c2", { economia: { "economia.vat_rate": v(10) } }));
    expect(domandaDiSilvio(conIva, scritturaDalPiano(conIva))?.testo ?? "").not.toMatch(/IVA/);
  });

  it("chi non vede gli importi non la legge", () => {
    expect(domandaDiSilvio(piano, s, new Date(), false)?.testo ?? "").not.toMatch(/IVA/);
  });
});

describe("6. data su un giorno chiuso o già passata", () => {
  const fr = (d: string) => frammento("c1", { fasi: { "fasi.work_start_date": v(d), "fasi.order_work_phases": v(DURATE) } });
  const OGGI = "2026-11-02";

  it("Ferragosto va al primo giorno utile, e lo dice", () => {
    const [letto] = conModelloSeMancanoLeFasi(fr("2027-08-15"), null, undefined, OGGI);
    const inizio = letto.aree.fasi?.["fasi.work_start_date"];
    expect(inizio?.valore).toBe("2027-08-16");
    expect(inizio?.nota).toMatch(/15\/08\/2027 è domenica.*16\/08\/2027/);
    expect(letto.avvisi?.join(" ")).toMatch(/primo giorno utile/);
    expect(scritturaDalPiano(fondi(PIANO(), letto)).ordine.work_start_date).toBe("2027-08-16");
  });

  it("una data passata resta, con l'avviso", () => {
    const [letto] = conModelloSeMancanoLeFasi(fr("2026-10-05"), null, undefined, OGGI);
    expect(letto.aree.fasi?.["fasi.work_start_date"]?.valore).toBe("2026-10-05");
    expect(letto.avvisi?.join(" ")).toMatch(/già passato/);
  });

  it("una data giusta non cambia niente", () => {
    const originale = fr("2026-11-16");
    expect(conModelloSeMancanoLeFasi(originale, null, undefined, OGGI)[0]).toBe(originale);
  });
});

describe("7. preventivo firmato", () => {
  it("«accettata» è firmato e convertibile", () => {
    expect(preventivoFirmato({ status: "accettata" })).toBe(true);
    expect(preventivoConvertibile({ status: "accettata" })).toBe(true);
  });

  it("«accettato» senza firma non è firmato, e con la firma avvisa che la RPC lo rifiuta", () => {
    expect(preventivoFirmato({ status: "accettato" })).toBe(false);
    expect(preventivoConvertibile({ status: "accettato" })).toBe(false);
    expect(preventivoFirmato({ status: "accettato", signed_at: "2026-10-20T10:00:00Z" })).toBe(true);
    const fr = frammentoDaPreventivo({ quote: { id: "q", quote_number: "P1", status: "accettato", signed_at: "2026-10-20T10:00:00Z", subtotal: 100, vat_amount: 22, total: 122 }, righe: [] });
    expect(fr.avvisi?.join(" ")).toMatch(/«accettato».*non può nascere/);
  });

  it("«accettata» senza firma non avvisa", () => {
    const fr = frammentoDaPreventivo({ quote: { id: "q", quote_number: "P1", status: "accettata", subtotal: 100, vat_amount: 22, total: 122 }, righe: [] });
    expect(fr.avvisi ?? []).toEqual([]);
  });
});

describe("8. scelte miste fra due documenti", () => {
  const rate = (n: number) => [{ label: "Unica", type: "deposit", amount: n, trigger_evento: "firma_contratto" }];
  const doc = (id: string, totale: number, r: number) => frammento(id, {
    economia: { "economia.total_amount": v(totale), "economia.vat_rate": v(10) },
    pagamenti: { "pagamenti.rate": v(rate(r)) },
  });

  it("importo da uno, rate dall'altro: entra perché l'ha scelto la persona, ma il «Controlla» mostra il ⚠", () => {
    let piano = fondi(fondi(PIANO(), doc("a", 18000, 19800)), doc("b", 19500, 21450));
    expect(piano.conflitti.length).toBe(2);
    const scegli = (chiave: string, area: "economia" | "pagamenti", id: string) => {
      piano = applica(piano, { tipo: "scegli_fonte", area, chiave, fonte: "contratto", idFonte: id, etichettaFonte: `Documento ${id}` }).piano;
    };
    scegli("economia.total_amount", "economia", "b");
    scegli("pagamenti.rate", "pagamenti", "a");
    const s = scritturaDalPiano(piano);
    expect(s.rate[0].amount).toBe(19800);
    const voce = elencoControlla(piano, s).flatMap((g) => g.voci).find((x) => x.chiave === "pagamenti.rate");
    expect(voce?.fuori).toBeNull();
    expect(voce?.nota).toMatch(/⚠.*19\.800,00 €.*21\.450,00 €/);
  });
});

describe("9. annulla identica", () => {
  it("le colonne si ripristinano di nuovo dopo aver cancellato le righe", () => {
    const f = funzione("commessa_annulla_silvio");
    const cancella = f.indexOf("execute format('delete from public.%I where id = $1', r.tabella)");
    const dopo = f.indexOf("where (v_attuale->k) is distinct from (r.colonne->k->'prima')");
    expect(cancella).toBeGreaterThan(0);
    expect(dopo).toBeGreaterThan(cancella);
  });
});

describe("10. parole grezze", () => {
  it.each([
    ["Non si può annullare: dopo Silvio si è aggiunto lavoro, righe in «company costs» (company costs). Annulla a mano o tieni la commessa.", /un costo/, /company/],
    ["Non si può annullare: La ditta Rossi è stata modificata («is_paid»). Annulla a mano o tieni la commessa.", /il pagamento/, /is_paid/],
    ["Non si può annullare: «is_paid» è stato cambiato dopo Silvio. Annulla a mano o tieni la commessa.", /il pagamento/, /is_paid/],
    ["Non si può annullare: dopo Silvio si è aggiunto lavoro, una fattura (invoices). Annulla a mano o tieni la commessa.", /una fattura/, /invoices/],
    ["Non si può annullare: Una riga di «order work phase voci» creata da Silvio è stata cambiata («costo_materiali»). Annulla a mano.", /Una voce prevista/, /order work|costo_materiali/],
  ])("%s", (messaggio, c, non) => {
    const t = rifiutoInParole(messaggio);
    expect(t).toMatch(c);
    expect(t).not.toMatch(non);
  });
});

describe("11. senza il permesso sui costi", () => {
  it("`tolte_permessi` lo dice, prima che i costi spariscano", () => {
    const f = funzione("_silvio_scrittura_permessa");
    const segna = f.indexOf("v_senza := v_senza || 'costi'::text");
    const togli = f.indexOf("public._silvio_togli_chiavi(s->'ditte', array['costo_previsto'])");
    expect(segna).toBeGreaterThan(0);
    expect(togli).toBeGreaterThan(segna);
  });

  it("il popup lo dice in parole", () => {
    const [riga] = restatoFuori({ tolte_permessi: ["costi"] }, PIANO());
    expect(riga).toMatch(/costi previsti di voci e ditte.*a 0/);
    expect(riga).not.toMatch(/altri dati/);
  });
});

describe("12. quantità del mezzo", () => {
  it("il popup la dice", () => {
    const mezzi: Partial<MezzoDelPiano>[] = [{ mezzo_id: "m1", nome: "Ponteggio", fasi: ["Facciata"], quantita: 1, stato: "proposta" }];
    expect(testoValore("mezzi.allocazioni", mezzi)).toMatch(/Ponteggio.*quantità 1/);
  });
});

describe("13. bozza ripresa con le rate fuori conto", () => {
  it("avvisa la persona", () => {
    const piano = fondi(PIANO(), frammento("c1", {
      economia: { "economia.total_amount": v(20000), "economia.vat_rate": v(22) },
      pagamenti: { "pagamenti.rate": v([{ label: "Unica", type: "deposit", amount: 25620 }]) },
    }));
    const [avviso] = avvisiDiRipresa(piano);
    expect(avviso).toMatch(/25\.620,00 €.*24\.400,00 €/);
    expect(avviso).toMatch(/resta fuori/);
  });

  it("con i conti a posto tace", () => {
    const piano = fondi(PIANO(), frammento("c1", {
      economia: { "economia.total_amount": v(21000), "economia.vat_rate": v(22) },
      pagamenti: { "pagamenti.rate": v([{ label: "Unica", type: "deposit", amount: 25620 }]) },
    }));
    expect(avvisiDiRipresa(piano)).toEqual([]);
  });
});

describe("14. cliente nuovo", () => {
  const s = (nome: string | null, email: string | null = null) => ({
    ...scritturaDalPiano(PIANO()), cliente: { customer_id: null as string | null, nome, email },
  });
  const CLIENTI = [
    { id: "c1", first_name: "Mario", last_name: "Rossi", email: "mario@example.invalid" },
    { id: "c2", first_name: "Omonimo", last_name: "Doppio", email: null as string | null },
    { id: "c3", first_name: "Omonimo", last_name: "Doppio", email: null as string | null },
  ];

  it("un nome che non è nel gestionale ferma «Crea», e lo dice", () => {
    expect(prontaPerScrivere(s("Luigi Nuovo"), CLIENTI).join(" ")).toMatch(/«Luigi Nuovo» non è ancora nel gestionale/);
    expect(prontaPerScrivere(s("Luigi Nuovo"), []).length).toBe(1);
  });

  it("la stessa ricerca della RPC: nome nei due ordini, email, e solo se è uno", () => {
    expect(prontaPerScrivere(s("rossi  mario"), CLIENTI)).toEqual([]);
    expect(prontaPerScrivere(s("Altro nome", "MARIO@example.invalid"), CLIENTI)).toEqual([]);
    expect(prontaPerScrivere(s("Omonimo Doppio"), CLIENTI).length).toBe(1);
  });

  it("finché l'elenco non è arrivato decide la RPC", () => {
    expect(prontaPerScrivere(s("Luigi Nuovo"))).toEqual([]);
    expect(prontaPerScrivere(s(null)).join(" ")).toMatch(/Manca il cliente/);
  });
});
