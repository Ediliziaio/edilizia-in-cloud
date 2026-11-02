/**
 * La pulizia della risposta del modello (fase 1, lotto 1.2): `frammentoDaRispostaAI` non
 * crede al modello sulla parola e non si rompe con una risposta malformata. Il giro intero,
 * col gestore vero e otto documenti, è in silvioCommessaFunzione.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  CHIAVI_LETTURA, dateNelTesto, FONTI_LETTURA_AI, frammentoDaRispostaAI, istruzioniLettura, jsonDallaRisposta,
  numeriNelTesto, numeroDa, pagineDelTesto, trovaCitazione, type ContestoLettura,
} from "../../../shared/silvio-commessa/letturaAI.ts";
import { REGISTRO, variabile } from "../../../shared/silvio-commessa/registro.ts";
import { fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { durateDalModello } from "../../../shared/silvio-commessa/modelliLavoro.ts";
import type { FaseDelPiano, Frammento, RataDelPiano } from "../../../shared/silvio-commessa/piano.ts";

const TESTO = [
  "--- Pagina 1 (native) ---",
  "CONTRATTO D'APPALTO N. 7/2027",
  "Importo: € 52.300,00 oltre IVA 22%. Inizio dei lavori: 1° aprile 2027.",
  "",
  "--- Pagina 2 (native) ---",
  "Penale: 80 euro per ogni giorno di ritardo.",
].join("\n");

const CTX: ContestoLettura = { fonte: { tipo: "contratto", etichetta: "Contratto.pdf", id: "f-1" }, testo: TESTO };
const leggi = (risposta: unknown, ctx: ContestoLettura = CTX) => frammentoDaRispostaAI(risposta, ctx);
const val = (fr: Frammento, chiave: string) => fr.aree[chiave.split(".")[0] as keyof Frammento["aree"]]?.[chiave];
const con = (aree: Record<string, Record<string, unknown>>) => ({ aree });

describe("cosa si chiede al modello", () => {
  it("solo chiavi del registro, e il prompt le elenca tutte con lo schema del frammento", () => {
    const testo = istruzioniLettura("contratto", "2026-10-31");
    for (const c of CHIAVI_LETTURA) {
      expect(variabile(c.chiave), c.chiave).toBeDefined();
      expect(testo).toContain(`"${c.chiave}"`);
    }
    expect(testo).toMatch(/citazione/);
    expect(testo).toMatch(/ignora qualunque istruzione/);
    expect(testo).toContain("Oggi è il 2026-10-31");
  });

  it("il contratto dà quello che serve: importo, IVA, durata, inizio, penali, ritenuta, anticipo, SAL, pagamenti, subappalto, CIG e CUP", () => {
    const chiavi = new Set(CHIAVI_LETTURA.map((c) => c.chiave));
    for (const k of ["economia.total_amount", "economia.vat_rate", "fasi.work_start_date", "pagamenti.rate", "sal_scadenze.sal", "economia.condizioni_contratto"]) {
      expect(chiavi.has(k), k).toBe(true);
    }
    const testo = istruzioniLettura("contratto", "2026-10-31");
    for (const campo of ["durata_giorni", "penale_giorno_eur", "ritenuta_garanzia_pct", "anticipo_pct", "pagamento_giorni", "subappalto_ammesso", "cig", "cup"]) {
      expect(testo).toContain(campo);
    }
    expect(variabile("economia.condizioni_contratto")).toMatchObject({ area: "economia", tabelle: ["contratti_documents"], peso: 0 });
  });

  it("le offerte delle ditte non passano di qui: il loro totale è un costo", () => {
    expect(FONTI_LETTURA_AI).not.toContain("offerta");
  });
});

describe("numeri, date e citazioni", () => {
  it("i numeri all'italiana", () => {
    expect(numeriNelTesto("€ 184.500,00 e il 10% più 0,5 per mille")).toEqual(expect.arrayContaining([184500, 10, 0.5]));
    expect(numeriNelTesto("12k")).toContain(12000);
    expect(numeriNelTesto("12 mila euro")).toContain(12000);
    expect(numeriNelTesto("1.5 kW")).toContain(1.5);
    expect(numeroDa("38.000,00")).toBe(38000);
    expect(numeroDa("38000.5")).toBe(38000.5);
    expect(numeroDa("1.250")).toBe(1250);
    expect(numeroDa("€ 7.500")).toBe(7500);
    expect(numeroDa("centomila")).toBeNull();
    expect(numeroDa(Number.NaN)).toBeNull();
  });

  it("le date scritte in tre modi", () => {
    expect(dateNelTesto("dal 01/03/2027")).toEqual(["2027-03-01"]);
    expect(dateNelTesto("Inizio: 1° aprile 2027")).toEqual(["2027-04-01"]);
    expect(dateNelTesto("entro il 2027-06-30")).toEqual(["2027-06-30"]);
    expect(dateNelTesto("entro 120 giorni")).toEqual([]);
  });

  it("la citazione si cerca nella pagina giusta, anche con apici, accenti, maiuscole e puntini", () => {
    const pagine = pagineDelTesto(TESTO);
    expect(pagine.map((p) => p.numero)).toEqual([1, 2]);
    expect(trovaCitazione("penale: 80 EURO per ogni giorno", pagine)).toEqual({ pagina: 2 });
    expect(trovaCitazione("contratto d’appalto", pagine)).toEqual({ pagina: 1 });
    expect(trovaCitazione("Importo: € 52.300,00 … IVA 22%", pagine)).toEqual({ pagina: 1 });
    expect(trovaCitazione("penale di 100 euro", pagine)).toBeNull();
    expect(trovaCitazione("…", pagine)).toBeNull();
  });
});

describe("i valori: si tengono quelli provati, gli altri restano proposte", () => {
  it("valore con citazione trovata e cifra dentro: fatto, la pagina la dice il testo", () => {
    const fr = leggi(con({ economia: { "economia.total_amount": { valore: 52300, citazione: "€ 52.300,00 oltre IVA", dove: "pagina 7", fiducia: 0.9 } } }));
    expect(val(fr, "economia.total_amount")).toMatchObject({
      valore: 52300, stato: "fatto", fiducia: 0.9, fonte: { tipo: "contratto", id: "f-1", dove: "pagina 1", citazione: "€ 52.300,00 oltre IVA" },
    });
  });

  it("la fiducia del modello non arriva mai a 1", () => {
    const fr = leggi(con({ economia: { "economia.vat_rate": { valore: 22, citazione: "IVA 22%", fiducia: 1 } } }));
    expect(val(fr, "economia.vat_rate")!.fiducia).toBe(0.95);
  });

  it("cifra che non compare nella citazione: proposta, con il motivo", () => {
    const fr = leggi(con({ economia: { "economia.total_amount": { valore: 63806, citazione: "€ 52.300,00 oltre IVA 22%", fiducia: 0.9 } } }));
    expect(val(fr, "economia.total_amount")).toMatchObject({ stato: "proposta", fiducia: 0.4 });
    expect(val(fr, "economia.total_amount")!.nota).toMatch(/non compare nella citazione/);
  });

  it("data giusta nella citazione; data calcolata no", () => {
    const fr = leggi(con({ fasi: {
      "fasi.work_start_date": { valore: "2027-04-01", citazione: "Inizio dei lavori: 1° aprile 2027" },
      "fasi.work_end_date": { valore: "2027-07-30", citazione: "Inizio dei lavori: 1° aprile 2027" },
    } }));
    expect(val(fr, "fasi.work_start_date")!.stato).toBe("fatto");
    expect(val(fr, "fasi.work_end_date")!.stato).toBe("proposta");
  });

  it("senza citazione o con una citazione che non c'è: fiducia 0,3 e proposta", () => {
    const fr = leggi(con({ economia: {
      "economia.total_amount": { valore: 52300, fiducia: 0.99 },
      "economia.vat_rate": { valore: 22, citazione: "IVA agevolata al 22 per cento", fiducia: 0.99 },
    } }));
    expect(val(fr, "economia.total_amount")).toMatchObject({ stato: "proposta", fiducia: 0.3 });
    expect(val(fr, "economia.vat_rate")).toMatchObject({ stato: "proposta", fiducia: 0.3 });
  });

  it("fiducia dichiarata bassa: proposta anche con la prova", () => {
    const fr = leggi(con({ economia: { "economia.vat_rate": { valore: 22, citazione: "IVA 22%", fiducia: 0.5 } } }));
    expect(val(fr, "economia.vat_rate")).toMatchObject({ stato: "proposta", fiducia: 0.5 });
  });

  it("nome corto dentro l'area giusta e chiave nell'area sbagliata: si riconoscono", () => {
    const fr = leggi(con({
      economia: { total_amount: { valore: 52300, citazione: "52.300,00" } },
      cliente: { "fasi.work_start_date": { valore: "2027-04-01", citazione: "1° aprile 2027" } },
    }));
    expect(val(fr, "economia.total_amount")!.valore).toBe(52300);
    expect(val(fr, "fasi.work_start_date")!.valore).toBe("2027-04-01");
  });

  it("forme sbagliate: avviso e niente valore", () => {
    const fr = leggi(con({
      economia: {
        "economia.total_amount": { valore: -5, citazione: "x" },
        "economia.vat_rate": { valore: 23, citazione: "IVA 22%" },
      },
      fasi: { "fasi.work_start_date": { valore: "2027-02-30", citazione: "1° aprile 2027" } },
      cliente: { "cliente.contatto": { valore: { client_email: "non-è-una-email", client_phone: "12" }, citazione: "x" } },
      pagamenti: { "pagamenti.payment_type": { valore: "contanti", citazione: "x" } },
    }));
    expect(fr.aree).toEqual({});
    expect(fr.avvisi).toHaveLength(5);
  });

  it("rate: importi dalle percentuali sul totale ivato, eventi sconosciuti tolti, somma oltre il 100 % segnalata", () => {
    const fr = leggi(con({
      economia: { "economia.total_amount": { valore: 52300, citazione: "52.300,00" }, "economia.vat_rate": { valore: 22, citazione: "IVA 22%" } },
      pagamenti: { "pagamenti.rate": { valore: [
        { label: "Acconto", percent: 50, trigger_evento: "firma_contratto" },
        { label: "SAL 1", type: "deposit", amount: "20.000,00", trigger_evento: "sal_numero", trigger_numero: 1 },
        { label: "Saldo", type: "balance", percent: 60, trigger_evento: "quando_vuole" },
        { label: "Rotto" },
        "non una rata",
      ], citazione: "Importo: € 52.300,00" } },
    }));
    const rate = val(fr, "pagamenti.rate")!;
    expect(rate.valore).toEqual([
      { label: "Acconto", type: "deposit", amount: 31903, percent: 50, trigger_evento: "firma_contratto" },
      { label: "SAL 1", type: "deposit", amount: 20000, trigger_evento: "sal_numero", trigger_numero: 1 },
      { label: "Saldo", type: "balance", amount: 38283.6, percent: 60, trigger_evento: null },
    ] satisfies RataDelPiano[]);
    expect(rate.nota).toMatch(/Rotto/);
    expect(rate.nota).toMatch(/sommano 110 %/);
  });

  it("fasi: un elenco di nomi va bene; le durate in fila; date sbagliate tolte", () => {
    const fr = leggi(con({ fasi: { "fasi.order_work_phases": { valore: [
      { name: "Allestimento", giorni: 1 }, { name: "Scavi", giorni: 3, start_date: "2027-04-01", end_date: "2027-03-01" }, { name: "Getti", giorni: "4" }, { giorni: 2 }, null,
    ], citazione: "Contratto d'appalto" } } }));
    expect(val(fr, "fasi.order_work_phases")!.valore).toEqual([
      { name: "Allestimento", giorni: 1, giorno_inizio: 1 },
      { name: "Scavi", giorni: 3, giorno_inizio: 2, start_date: "2027-04-01" },
      { name: "Getti", giorni: 4, giorno_inizio: 5 },
    ] satisfies FaseDelPiano[]);
  });

  it("revisione 1/11, L3: senza IVA le rate in percentuale sono sull'imponibile, ma restano una proposta con «manca l'IVA»", () => {
    const testo = "Importo: € 100.000,00. Pagamenti: 30% alla firma, 70% a fine lavori.";
    const fr = leggi(con({
      economia: { "economia.total_amount": { valore: 100000, citazione: "Importo: € 100.000,00" } },
      pagamenti: { "pagamenti.rate": { valore: [{ label: "Firma", percent: 30 }, { label: "Fine lavori", type: "balance", percent: 70 }], citazione: "30% alla firma" } },
    }), { ...CTX, testo });
    const rate = val(fr, "pagamenti.rate")!;
    expect((rate.valore as RataDelPiano[]).map((r) => r.amount)).toEqual([30000, 70000]);
    expect(rate.stato).toBe("proposta");
    expect(rate.nota).toMatch(/Manca l'IVA/);
    // Con l'IVA, le stesse rate sono sul totale ivato e possono essere «fatto».
    const conIva = leggi(con({
      economia: { "economia.total_amount": { valore: 100000, citazione: "Importo: € 100.000,00" }, "economia.vat_rate": { valore: 10, citazione: "Importo" } },
      pagamenti: { "pagamenti.rate": { valore: [{ label: "Firma", percent: 30 }], citazione: "30% alla firma" } },
    }), { ...CTX, testo });
    expect((val(conIva, "pagamenti.rate")!.valore as RataDelPiano[])[0].amount).toBe(33000);
    expect(val(conIva, "pagamenti.rate")!.nota ?? "").not.toMatch(/Manca l'IVA/);
  });

  it("revisione 1/11, L4: se una fase non ha la durata, nessuna parte da un giorno inventato (prima si sovrapponevano)", () => {
    const fr = leggi(con({ fasi: { "fasi.order_work_phases": { valore: [
      "Allestimento", { name: "Scavi", giorni: 3 }, { name: "Getti", giorni: "4" },
    ], citazione: "Contratto d'appalto" } } }));
    const fasi = val(fr, "fasi.order_work_phases")!.valore as FaseDelPiano[];
    expect(fasi.map((f) => f.giorno_inizio)).toEqual([undefined, undefined, undefined]);
    // La sequenza la fa il modello, dopo aver dato la durata anche ad «Allestimento»: una dopo l'altra.
    const conModello = durateDalModello(fasi, "ristrutturazione").fasi;
    for (let i = 1; i < conModello.length; i++) {
      expect(conModello[i].giorno_inizio).toBe(conModello[i - 1].giorno_inizio! + conModello[i - 1].giorni!);
    }
  });

  it("condizioni: CIG e CUP con la forma giusta, campi sconosciuti fuori, la provenienza di ogni campo", () => {
    const fr = leggi(con({ economia: { "economia.condizioni_contratto": { valore: {
      penale_giorno_eur: { valore: 80, citazione: "Penale: 80 euro per ogni giorno di ritardo", dove: "pagina 9" },
      cig: { valore: "CIG-NON-VALIDO", citazione: "CIG" },
      bonus_segreto: { valore: 1, citazione: "x" },
      numero_contratto: "7/2027",
    }, citazione: "CONTRATTO D'APPALTO N. 7/2027", fiducia: 0.9 } } }));
    const c = val(fr, "economia.condizioni_contratto")!;
    expect(c.valore).toEqual({
      penale_giorno_eur: 80, numero_contratto: "7/2027",
      fonti: {
        penale_giorno_eur: { dove: "pagina 2", citazione: "Penale: 80 euro per ogni giorno di ritardo" },
        numero_contratto: { dove: "pagina 1", citazione: "CONTRATTO D'APPALTO N. 7/2027" },
      },
    });
    expect(c.stato).toBe("fatto");
    expect(c.nota).toMatch(/cig, bonus_segreto/);
  });

  it("condizioni con un campo senza prova: tutto in proposta, e si dice quale", () => {
    const fr = leggi(con({ economia: { "economia.condizioni_contratto": { valore: {
      penale_giorno_eur: { valore: 80, citazione: "Penale: 80 euro" },
      ritenuta_garanzia_pct: { valore: 5, citazione: "ritenuta del 5%" },
    } } } }));
    const c = val(fr, "economia.condizioni_contratto")!;
    expect(c.stato).toBe("proposta");
    expect(c.nota).toMatch(/Da controllare: ritenuta_garanzia_pct/);
  });

  it("immagine: la citazione non si cerca, tutto proposta a 0,6 al massimo", () => {
    const fr = leggi(con({ identita: { "identita.internal_notes": { valore: "Bagno 2×3 m", citazione: "BAGNO 6 mq", fiducia: 0.9 } } }),
      { fonte: { tipo: "documento", etichetta: "foto.jpg" }, immagine: true });
    expect(val(fr, "identita.internal_notes")).toMatchObject({ stato: "proposta", fiducia: 0.6, fonte: { dove: "immagine" } });
  });

  it("tipo di lavoro: un modello noto, o «generico» con la nota", () => {
    const fr = leggi(con({ identita: { "identita.tipo_lavoro": { valore: "Rifacimento bagno", citazione: "contratto" } } }));
    expect(val(fr, "identita.tipo_lavoro")!.valore).toBe("bagno");
    const altro = leggi(con({ identita: { "identita.tipo_lavoro": { valore: "giardinaggio", citazione: "contratto" } } }));
    expect(val(altro, "identita.tipo_lavoro")).toMatchObject({ valore: "generico", nota: expect.stringMatching(/giardinaggio/) });
  });
});

describe("risposte malformate: niente si rompe", () => {
  it("testo senza JSON, JSON tagliato, nulla: frammento vuoto con l'avviso", () => {
    for (const r of ["Non riesco a leggere il documento.", "{\"aree\": {\"economia\": ", "", null, undefined, 42, [1, 2], true]) {
      const fr = leggi(r);
      expect(fr.aree, String(r)).toEqual({});
      expect(fr.fonte).toMatchObject({ tipo: "contratto", etichetta: "Contratto.pdf" });
      expect(fr.avvisi?.join(" ")).toMatch(/non si legge/);
    }
  });

  it("JSON dentro ```json``` o in mezzo a una frase: si legge", () => {
    const corpo = JSON.stringify(con({ economia: { "economia.vat_rate": { valore: 22, citazione: "IVA 22%" } } }));
    expect(jsonDallaRisposta(`Ecco:\n\`\`\`json\n${corpo}\n\`\`\``)).toEqual(JSON.parse(corpo));
    expect(val(leggi(`Ecco i dati ${corpo} spero vada bene`), "economia.vat_rate")!.valore).toBe(22);
  });

  it("aree che non sono oggetti, valori senza «valore», avvisi strani: avvisi, niente eccezioni", () => {
    const fr = leggi({ aree: { economia: "tanti soldi", fasi: [1, 2], cliente: { "cliente.nome": "Mario" } }, avvisi: [null, 7, "pagina 3 storta"] });
    expect(fr.aree).toEqual({});
    expect(fr.avvisi).toEqual(expect.arrayContaining(["pagina 3 storta", "7", expect.stringMatching(/economia/), expect.stringMatching(/cliente\.nome/)]));
  });

  it("chiave scritta due volte (elenco piatto più aree): vale la prima", () => {
    const fr = leggi({
      aree: { economia: { "economia.vat_rate": { valore: 22, citazione: "IVA 22%" } } },
      valori: [{ chiave: "economia.vat_rate", valore: 10, citazione: "IVA 10%" }],
    });
    expect(val(fr, "economia.vat_rate")!.valore).toBe(22);
    expect(fr.avvisi?.join(" ")).toMatch(/due volte/);
  });

  it("mille risposte a caso: mai un'eccezione, solo chiavi del registro, fiducia fra 0 e 0,95", () => {
    let seme = 7;
    const caso = () => { seme = (seme * 16807) % 2147483647; return seme / 2147483647; };
    const scegli = <T,>(xs: readonly T[]): T => xs[Math.floor(caso() * xs.length)];
    const atomi = [null, undefined, 0, -1, 1e12, "", "abc", "12,5", "2027-13-01", "2027-04-01", true, [], {}, [{}], { valore: 1 }, NaN];
    const valoreCaso = (prof: number): unknown => prof > 2 || caso() < 0.5
      ? scegli(atomi)
      : caso() < 0.5 ? Array.from({ length: 3 }, () => valoreCaso(prof + 1))
      : Object.fromEntries(["valore", "citazione", "dove", "fiducia", "name", "amount", "percent", "cig"].map((k) => [k, valoreCaso(prof + 1)]));
    const chiavi = [...REGISTRO.map((v) => v.chiave), "a.b", "economia.niente", "x"];
    for (let i = 0; i < 1000; i++) {
      const aree: Record<string, Record<string, unknown>> = {};
      for (let k = 0; k < 4; k++) {
        const chiave = scegli(chiavi);
        (aree[chiave.split(".")[0]] ??= {})[chiave] = caso() < 0.8 ? { valore: valoreCaso(0), citazione: scegli(["IVA 22%", "x", null, 5]), fiducia: valoreCaso(2) } : valoreCaso(0);
      }
      const fr = leggi(caso() < 0.1 ? valoreCaso(0) : { aree });
      for (const [area, valori] of Object.entries(fr.aree)) {
        for (const [chiave, v] of Object.entries(valori ?? {})) {
          expect(variabile(chiave)?.area).toBe(area);
          expect(v.fiducia).toBeGreaterThanOrEqual(0);
          expect(v.fiducia).toBeLessThanOrEqual(0.95);
          expect(["fatto", "proposta"]).toContain(v.stato);
        }
      }
      // E il frammento si fonde senza problemi.
      expect(() => fondi(pianoVuoto("azienda"), fr)).not.toThrow();
    }
  });
});
