/**
 * Le correzioni d'esperienza del popup «Crea con Silvio» (2/11/2026), visto con l'AI vera: meno cose
 * da decidere, quanto fidarsi dei numeri, foto, bozze doppie, chat che decide, scadenze passate,
 * stato iniziale, durate irrealistiche. Dati inventati. Le parti a schermo stanno in
 * src/test/ui/silvioCommessaPopupRevisione.test.tsx.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { DbFinto } from "@/test/helpers/dbFinto";
import { applica, fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { eseguiRisposta, eseguiStrumento, MAX_MESSAGGIO_CHE_DECIDE } from "../../../shared/silvio-commessa/chat.ts";
import { frammentoDaRispostaAI, type ContestoLettura } from "../../../shared/silvio-commessa/letturaAI.ts";
import { adempimentiPrimaDiPartire } from "../../../shared/silvio-commessa/partenza.ts";
import type { FaseDelPiano, Frammento, PianoCommessa, RataDelPiano } from "../../../shared/silvio-commessa/piano.ts";
import { completezzaPiano } from "../../../shared/silvio-commessa/completezza.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
import { scartaAltreBozzeCrea, type ClientBozze } from "@/lib/silvio-commessa/bozze";
import { frammentoDaComputo } from "@/lib/silvio-commessa/lettori/computo";
import { bozzaComputoSchema, type BozzaComputo } from "@/lib/computo/editorNativo";
import {
  accettaProposte, avvisoStatoIniziale, cosaDecidere, divisioneDaDecidere, domandaDiSilvio, FASE_DA_CONFERMARE, numeriDaControllare, testoValore, titoloAltre,
} from "@/components/silvio-commessa/presentazione";
import { conConseguenze } from "@/components/silvio-commessa/useBozzaSilvio";

const AZ = "az-1";
const TOT = "economia.total_amount";
const IVA = "economia.vat_rate";
const RATE = "pagamenti.rate";

const contestoFoto = (): ContestoLettura => ({ fonte: { tipo: "documento", etichetta: "Foto.jpg" }, immagine: true, testo: null });
const contestoTesto = (testo: string): ContestoLettura => ({ fonte: { tipo: "documento", etichetta: "Capitolato.pdf" }, testo });

const conFrammento = (fr: Frammento, p: PianoCommessa = pianoVuoto(AZ)) => fondi(p, fr);
const conferma = (p: PianoCommessa, chiavi: string[]) => accettaProposte(p, chiavi).reduce((ora, m) => applica(ora, m).piano, p);

const foto = () => frammentoDaRispostaAI({
  aree: {
    economia: { [TOT]: { valore: 12000, citazione: "12.000 euro", fiducia: 0.9 }, [IVA]: { valore: 10, citazione: "IVA 10%", fiducia: 0.9 } },
    pagamenti: { [RATE]: { valore: [{ label: "Acconto", percent: 30 }, { label: "Saldo", percent: 70 }], citazione: "30% e 70%", fiducia: 0.9 } },
  },
}, contestoFoto());

describe("3. Quello che viene da una foto o senza prova resta fuori fino a «Va bene»", () => {
  it("da una foto: importo, IVA e rate non si scrivono, e il popup lo dice", () => {
    const p = conFrammento(foto());
    const s = scritturaDalPiano(p);
    expect(s.ordine.total_amount).toBeUndefined();
    expect(s.ordine.vat_rate).toBeUndefined();
    expect(s.rate).toEqual([]);
    expect(s.escluse.filter((e) => e.motivo === "proposta da confermare").map((e) => e.chiave).sort()).toEqual([TOT, IVA, RATE].sort());
    expect(p.aree.economia?.[TOT]?.nota).toMatch(/immagine.*«Va bene»/);
  });

  it("col «Va bene» a tutte entrano, e le rate in percentuale prendono gli importi da importo e IVA (G9)", () => {
    const p = conFrammento(foto());
    const dopo = conferma(p, [RATE, TOT, IVA]);
    const s = scritturaDalPiano(dopo);
    expect(s.ordine.total_amount).toBe(12000);
    expect(s.ordine.vat_rate).toBe(10);
    expect(s.rate.map((r) => r.amount)).toEqual([3960, 9240]);
  });

  it("citazione assente, o che non si trova nel documento: lo stesso", () => {
    const senza = frammentoDaRispostaAI({ aree: { economia: { [TOT]: { valore: 50000, fiducia: 0.9 } } } }, contestoTesto("Lavori di rifacimento"));
    expect(scritturaDalPiano(conFrammento(senza)).ordine.total_amount).toBeUndefined();
    const falsa = frammentoDaRispostaAI({ aree: { economia: { [TOT]: { valore: 50000, citazione: "euro 50.000", fiducia: 0.9 } } } }, contestoTesto("Lavori di rifacimento"));
    expect(scritturaDalPiano(conFrammento(falsa)).ordine.total_amount).toBeUndefined();
  });

  it("con la prova nel documento l'importo entra come prima", () => {
    const fr = frammentoDaRispostaAI({ aree: { economia: { [TOT]: { valore: 50000, citazione: "euro 50.000", fiducia: 0.9 } } } }, contestoTesto("Il prezzo è euro 50.000 a corpo"));
    expect(scritturaDalPiano(conFrammento(fr)).ordine.total_amount).toBe(50000);
  });

  it("le altre variabili di una foto non cambiano: il cliente non aspetta il sì", () => {
    const fr = frammentoDaRispostaAI({ aree: { cliente: { "cliente.nome": { valore: "Mario Prova", citazione: "Mario Prova", fiducia: 0.9 } } } }, contestoFoto());
    expect(fr.aree.cliente?.["cliente.nome"]?.daConfermare).toBeUndefined();
  });
});

const pianoConRate = (): PianoCommessa => conFrammento({
  fonte: { tipo: "contratto", etichetta: "Contratto.pdf" },
  aree: {
    economia: { [TOT]: { valore: 10000, fiducia: 0.9, stato: "fatto" }, [IVA]: { valore: 10, fiducia: 0.9, stato: "fatto" } },
    pagamenti: { [RATE]: { valore: [{ label: "Acconto", type: "deposit", amount: 3300, percent: 30, daPercentuale: true }, { label: "Saldo", type: "balance", amount: 7700, percent: 70, daPercentuale: true }], fiducia: 0.9, stato: "fatto" } },
  },
});

describe("5. La chat decide subito solo quello che la persona ha scritto", () => {
  const dice = (chiave: string, valore: unknown, messaggio: string | null, p: PianoCommessa = pianoConRate()) =>
    eseguiStrumento(p, { nome: "cambia_valore", argomenti: { chiave, valore } }, undefined, { messaggioPersona: messaggio, oggi: "2026-11-02" });
  const modifica = (e: ReturnType<typeof dice>) => (e.tipo === "modifica" ? e.modifiche[0] : null);

  it("«il totale è 15.000» vale subito, si annulla, e le rate in percentuale seguono", () => {
    const e = dice(TOT, 15000, "il totale è 15.000");
    const m = modifica(e)!;
    expect(m).not.toHaveProperty("proposta");
    const b = applica(pianoConRate(), m);
    expect(scritturaDalPiano(b.piano).ordine.total_amount).toBe(15000);
    expect((b.piano.aree.pagamenti?.[RATE]?.valore as RataDelPiano[]).map((r) => r.amount)).toEqual([4950, 11550]);
    expect(b.storia).toHaveLength(1);
  });

  it("il modello non scrive un importo che la persona non ha digitato", () => {
    expect(modifica(dice(TOT, 99000, "sistema le date"))).toMatchObject({ proposta: true });
    expect(modifica(dice(TOT, 99000, null))).toMatchObject({ proposta: true });
    // Il totale con l'IVA tolta dal modello non è la cifra detta.
    expect(modifica(dice(TOT, 12295.08, "15.000 iva compresa"))).toMatchObject({ proposta: true });
  });

  it("un documento che dà istruzioni: conta il messaggio, e un testo incollato non è un ordine", () => {
    const risposta = eseguiRisposta(pianoConRate(), [{ nome: "cambia_valore", argomenti: { chiave: TOT, valore: 1 } }], undefined, { messaggioPersona: "leggi il documento" });
    expect(risposta.modifiche[0]).toMatchObject({ proposta: true });
    const incollato = `${"testo incollato ".repeat(Math.ceil(MAX_MESSAGGIO_CHE_DECIDE / 16))} il totale è 15.000`;
    expect(modifica(dice(TOT, 15000, incollato))).toMatchObject({ proposta: true });
  });

  it("IVA e date: valgono se le ha scritte, anche senza anno", () => {
    expect(modifica(dice(IVA, 22, "iva al 22"))).not.toHaveProperty("proposta");
    expect(modifica(dice("fasi.work_end_date", "2026-12-18", "si finisce il 18 dicembre"))).not.toHaveProperty("proposta");
    expect(modifica(dice("fasi.work_start_date", "2026-11-09", "si parte il 9/11"))).not.toHaveProperty("proposta");
    expect(modifica(dice("fasi.work_start_date", "2026-11-09", "si parte il 9 nov"))).not.toHaveProperty("proposta");
    expect(modifica(dice("fasi.work_start_date", "2026-11-09", "si parte lunedì prossimo"))).toMatchObject({ proposta: true });
    expect(modifica(dice("fasi.work_start_date", "2026-11-09", "si parte il 9/11/2027"))).toMatchObject({ proposta: true });
  });

  it("una data proposta non sposta le fasi: le sposta il suo «Va bene»", () => {
    const fasi: FaseDelPiano[] = [{ name: "Demolizioni", start_date: "2026-11-09", end_date: "2026-11-13", giorni: 5, giorno_inizio: 1 }];
    const p = conFrammento({ fonte: { tipo: "contratto", etichetta: "Contratto.pdf" }, aree: { fasi: { "fasi.order_work_phases": { valore: fasi, fiducia: 0.9, stato: "fatto" }, "fasi.work_start_date": { valore: "2026-11-09", fiducia: 0.9, stato: "fatto" } } } });
    const proposta = modifica(dice("fasi.work_start_date", "2026-11-16", "lunedì dopo", p))!;
    const out = conConseguenze(p, [proposta], "2026-11-02");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ proposta: true });
  });

  it("il resto resta proposta anche se il numero è nel messaggio: G18 non si tocca", () => {
    const e = eseguiStrumento(pianoConRate(), { nome: "cambia_valore", argomenti: { chiave: "ditte.assegnate", valore: [{ nome: "Ditta Prova" }] } }, undefined, { messaggioPersona: "metti la ditta Prova" });
    expect(modifica(e)).toMatchObject({ proposta: true });
  });
});

describe("6. Una scadenza passata non si scrive come data", () => {
  const OGGI = "2026-11-02";

  it("nel riepilogo, nel messaggio d'avvio e nell'avviso degli adempimenti", () => {
    expect(testoValore("sicurezza.adempimenti", [{ titolo: "CILA", scadenza: "2026-10-26" }, { titolo: "Cartello", scadenza: "2026-11-09" }], true, OGGI))
      .toBe("2 promemoria · 1 da fare subito");
    expect(testoValore("sicurezza.adempimenti", [{ titolo: "Cartello", scadenza: "2026-11-09" }], true, OGGI)).toBe("1 promemoria · entro 9 nov");
    expect(testoValore("comunicazione.avvio_cliente", { canale: "email", scadenza: "2026-10-26" }, true, OGGI)).toBe("bozza da mandare per email, da mandare subito: era da fare entro il 26 ott");
    const [cila] = adempimentiPrimaDiPartire({ lavoro: "Ristrutturazione bagno", fasi: [], inizio: "2026-11-02", ditte: 0, oggi: OGGI });
    expect(cila.avviso).toBe("Da fare subito: era da fare entro il 26 ott.");
  });

  it("il giorno stesso non è ancora passato, e il conto è in ora italiana", () => {
    expect(testoValore("sicurezza.adempimenti", [{ titolo: "CILA", scadenza: OGGI }], true, OGGI)).toBe("1 promemoria · entro 2 nov");
    // L'1 di notte in Italia del 3/11 sono ancora le 00 UTC del 3: alle 23.30 UTC del 2 in Italia è già il 3.
    expect(new Date("2026-11-02T23:30:00Z").toLocaleDateString("en-CA", { timeZone: "Europe/Rome" })).toBe("2026-11-03");
  });
});

/** Un computo di tanti capitoli costosi, senza cronoprogramma: la stima li mette uno dopo l'altro. */
const computoGrande = (capitoli: number, importoVoce: number): BozzaComputo => bozzaComputoSchema.parse({
  versione: 1, titolo: "Palazzina", committente: "", oggetto: "", mostraMisurePdf: false, mostraCodiciPdf: false, mostraFontiPdf: false, ivaModalita: "applicata", ivaAliquota: "10",
  voci: Array.from({ length: capitoli }, (_, i) => ({
    id: `v${i}`, capitolo: `Capitolo ${i + 1}`, categoria: "", sottocategoria: "", tariffa: "", descrizione: `Voce ${i + 1}`,
    unita: "cad", quantita: "1", prezzo: String(importoVoce), costo: "", sicurezza: false, detrazione: false, corpo: false, misure: [] as never[],
  })),
});

describe("8. Durate irrealistiche", () => {
  it("891 giornate in fila: niente date inventate, e Silvio chiede quanto dura", () => {
    const fr = frammentoDaComputo({ bozza: computoGrande(15, 90000), inizio: "2026-11-09" });
    const fasi = fr.aree.fasi?.["fasi.order_work_phases"]?.valore as FaseDelPiano[];
    expect(fasi).toHaveLength(15);
    expect(fasi.every((f) => !f.start_date && !f.end_date && !f.giorni)).toBe(true);
    expect(fr.aree.fasi?.["fasi.work_end_date"]).toBeUndefined();
    expect(fr.avvisi?.join(" ")).toMatch(/dimmi quanto dura il lavoro/i);

    const p = conFrammento({ fonte: { tipo: "persona", etichetta: "scelto da te" }, aree: { cliente: { "cliente.customer_id": { valore: "c0000000-0000-4000-a000-000000000001", fiducia: 1, stato: "fatto" } } } }, conFrammento(fr));
    const d = domandaDiSilvio(p, scritturaDalPiano(p), new Date("2026-11-02T10:00:00Z"));
    expect(d?.testo).toMatch(/Quanto dura il lavoro/);
  });

  it("un computo normale ha ancora le sue date", () => {
    const fr = frammentoDaComputo({ bozza: computoGrande(3, 9000), inizio: "2026-11-09" });
    const fasi = fr.aree.fasi?.["fasi.order_work_phases"]?.valore as FaseDelPiano[];
    expect(fasi.every((f) => !!f.start_date && !!f.end_date)).toBe(true);
    expect(fr.aree.fasi?.["fasi.work_end_date"]).toBeDefined();
  });
});

describe("4. Una sola bozza «crea» aperta", () => {
  const riga = (id: string, extra: Record<string, unknown> = {}) => ({ id, company_id: AZ, created_by: "u1", modo: "crea", stato: "bozza", ...extra });
  const seme = () => new DbFinto({ commessa_bozze: [
    riga("nuova"), riga("vecchia"),
    riga("creata", { stato: "creata" }),
    riga("completa", { modo: "completa" }),
    riga("collega", { created_by: "u2" }),
    riga("altra", { company_id: "az-2" }),
  ] });
  const restano = (db: DbFinto) => db.righe("commessa_bozze").map((r) => r.id).sort();

  it("parte una nuova: si scarta la vecchia di quell'utente, e nient'altro", async () => {
    const db = seme();
    expect(await scartaAltreBozzeCrea({ companyId: AZ, userId: "u1", tieni: "nuova" }, db.client as unknown as ClientBozze)).toBe(1);
    expect(restano(db)).toEqual(["altra", "collega", "completa", "creata", "nuova"]);
  });

  it("«Ricomincia»: via tutte le sue, ma mai una bozza già «creata»", async () => {
    const db = seme();
    expect(await scartaAltreBozzeCrea({ companyId: AZ, userId: "u1" }, db.client as unknown as ClientBozze)).toBe(2);
    expect(restano(db)).toEqual(["altra", "collega", "completa", "creata"]);
  });
});

describe("7. Lo stato iniziale", () => {
  const FIRMATO = { name: "Contratto Firmato", position: 0, is_default: true, is_support_phase: false };
  const testo = conFrammento({ fonte: { tipo: "testo", etichetta: "testo scritto" }, aree: { identita: { "identita.description": { valore: "Bagno", fiducia: 1, stato: "fatto" } } } });
  const contratto = conFrammento({ fonte: { tipo: "contratto", etichetta: "Contratto.pdf" }, aree: { identita: { "identita.description": { valore: "Bagno", fiducia: 1, stato: "fatto" } } } });

  it("da una riga di testo, senza una fase «da confermare», il popup lo dice", () => {
    expect(avvisoStatoIniziale(testo, { modo: "crea", preventivo_id: null }, [FIRMATO])).toMatch(/«Contratto Firmato» anche senza firma/);
  });

  it("niente avviso con un contratto, un preventivo, in «Completa», o se la fase da confermare c'è", () => {
    expect(avvisoStatoIniziale(contratto, { modo: "crea", preventivo_id: null }, [FIRMATO])).toBeNull();
    expect(avvisoStatoIniziale(testo, { modo: "crea", preventivo_id: "q1" }, [FIRMATO])).toBeNull();
    expect(avvisoStatoIniziale(testo, { modo: "completa", preventivo_id: null }, [FIRMATO])).toBeNull();
    expect(avvisoStatoIniziale(testo, { modo: "crea", preventivo_id: null }, [FIRMATO, { name: "Da confermare", position: 1 }])).toBeNull();
  });

  it("la migrazione: stessa espressione, nessun tocco a create_order_atomic, chiusa ad anon", () => {
    const sql = readFileSync("supabase/migrations/20281112160000_silvio_stato_iniziale.sql", "utf8");
    expect(sql).toContain(FASE_DA_CONFERMARE);
    expect(sql).not.toMatch(/create or replace function public\.create_order_atomic/i);
    expect(sql).toMatch(/revoke all on function public\._silvio_stato_iniziale\(uuid, jsonb, uuid\) from public, anon/i);
    expect(sql).toMatch(/lock_timeout/);
  });
});

describe("1. Meno cose da decidere", () => {
  const conTante = (): PianoCommessa => {
    let p = conFrammento({
      fonte: { tipo: "documento", etichetta: "Capitolato.pdf" },
      aree: {
        identita: { "identita.description": { valore: "Bagno", fiducia: 0.9, stato: "fatto" } },
        persone: { "persone.squadra": { valore: [{ employee_id: "e1", nome: "Mario Prova", fase: "Tetto", stato: "attenzione", avviso: "è in ferie" }], fiducia: 0.5, stato: "proposta" } },
        fasi: { "fasi.work_end_date": { valore: "2026-12-18", fiducia: 0.5, stato: "proposta" } },
      },
      avvisi: ["Pagina 7 illeggibile"],
    });
    p = conFrammento({ fonte: { tipo: "documento", etichetta: "Foto.jpg" }, aree: { economia: { [TOT]: { valore: 12000, fiducia: 0.5, stato: "proposta", daConfermare: true, nota: "Letto da un'immagine." } } } }, p);
    return p;
  };

  it("in evidenza solo cliente, importo e soldi: la persona non libera sta sotto", () => {
    const p = conTante();
    const d = cosaDecidere(p, scritturaDalPiano(p), completezzaPiano(p));
    const div = divisioneDaDecidere(d);
    expect(div.proposte.map((x) => x.chiave)).toEqual([TOT]);
    expect(div.domande.map((v) => v.chiave)).toEqual(["cliente.customer_id"]);
    expect(d.nonDisponibili).toHaveLength(1);
    expect(div.altre).toBeGreaterThanOrEqual(2);
    expect(div.subito).toBe(2);
  });

  it("un conflitto e un conto che non torna non si nascondono mai", () => {
    let p = conTante();
    p = conFrammento({ fonte: { tipo: "documento", etichetta: "Altro.pdf" }, aree: { economia: { [TOT]: { valore: 14000, fiducia: 0.9, stato: "fatto" } } } }, p);
    const d = cosaDecidere(p, scritturaDalPiano(p), completezzaPiano(p));
    expect(d.conflitti).toHaveLength(1);
    expect(divisioneDaDecidere(d).subito).toBeGreaterThanOrEqual(1);
  });

  it("il titolo del gruppo chiuso", () => {
    expect(titoloAltre(8)).toBe("Altre 8 cose, se vuoi guardarle");
    expect(titoloAltre(1)).toBe("Un'altra cosa, se vuoi guardarla");
  });
});

describe("2. Quanto fidarsi dei numeri", () => {
  const p = conFrammento({
    fonte: { tipo: "contratto", etichetta: "Contratto.pdf" },
    aree: {
      economia: { [TOT]: { valore: 12000, fiducia: 0.9, stato: "fatto" }, [IVA]: { valore: 10, fiducia: 0.5, stato: "proposta", daConfermare: true } },
      pagamenti: { [RATE]: { valore: [{ label: "Acconto", type: "deposit", amount: 6600 }, { label: "Saldo", type: "balance", amount: 6600 }], fiducia: 0.9, stato: "fatto" } },
      fasi: { "fasi.work_start_date": { valore: "2026-11-09", fiducia: 0.9, stato: "fatto" }, "fasi.work_end_date": { valore: "2026-11-26", fiducia: 0.5, stato: "proposta" } },
    },
  });

  it("importo, IVA, rate, inizio e fine, con ✓ o ✋", () => {
    const n = numeriDaControllare(p, scritturaDalPiano(p));
    expect(n.map((x) => x.testo.replace(/\s/g, " "))).toEqual(["importo 12.000 €", "IVA 10 %", "2 rate", "dal 9 nov", "al 26 nov"]);
    expect(n.map((x) => x.stato)).toEqual(["fatto", "proposta", "fatto", "fatto", "proposta"]);
  });

  it("chi non vede gli importi non li vede neanche qui, nemmeno quante rate sono", () => {
    const n = numeriDaControllare(p, scritturaDalPiano(p), false);
    expect(n.map((x) => x.testo)).toEqual(["dal 9 nov", "al 26 nov"]);
    expect(JSON.stringify(n)).not.toMatch(/12\.000|rate|IVA/);
  });

  it("quello che manca si vede, e un conflitto non dice le cifre", () => {
    const vuoto = pianoVuoto(AZ);
    expect(numeriDaControllare(vuoto, scritturaDalPiano(vuoto)).map((x) => x.stato)).toEqual(["manca", "manca", "manca"]);
    const litigano = conFrammento({ fonte: { tipo: "documento", etichetta: "B.pdf" }, aree: { economia: { [TOT]: { valore: 13000, fiducia: 0.9, stato: "fatto" } } } }, p);
    expect(numeriDaControllare(litigano, scritturaDalPiano(litigano))[0]).toMatchObject({ testo: "importo: da scegliere", stato: "attenzione" });
  });
});
