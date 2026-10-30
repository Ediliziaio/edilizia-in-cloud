import { describe, expect, it } from "vitest";
import {
  CONTRATTO_VUOTO,
  anticipazione,
  anticipazioneProposta,
  arrotonda,
  avanzamentoMisure,
  erroriContratto,
  fineAggiornata,
  formattaEuroContratto,
  importoDaElenco,
  importoVoce,
  leggiDatiContratto,
  messaggioContratto,
  penaleMaturata,
  prezzoNetto,
  ritenute,
  scadenzeContratto,
  totaliSal,
  valoreContratto,
  type AttoAggiuntivo,
  type ContrattoGenerale,
  type DatiContratto,
  type SalContratto,
  type VoceElenco,
} from "@/lib/orders/generali/contratto";

/**
 * Modulo «Contratto e SAL» della commessa generale (31/10/2026). I numeri sono quelli della
 * prova a secco della migrazione 20281031100000 in produzione: 1.000.000 € a base, ribasso 10%,
 * sicurezza 30.000 €, un atto da +50.000 € → 980.000 €; ordine prezzato dall'elenco 2.080 €.
 */

const contratto = (p: Partial<ContrattoGenerale> = {}): ContrattoGenerale => ({
  ...CONTRATTO_VUOTO,
  importoBase: 1_000_000, ribassoPct: 10, oneriSicurezza: 30_000,
  anticipazionePct: 20, anticipazioneImporto: 20_000, ritenutaPct: 0.5,
  ...p,
});
const atto = (p: Partial<AttoAggiuntivo> = {}): AttoAggiuntivo => ({
  id: "a", tipo: "atto_aggiuntivo", numero: null, data: "2026-10-01", descrizione: "Atto", importo: 0, giorniProroga: 0, allegato: null, ...p,
});
const sal = (p: Partial<SalContratto> = {}): SalContratto => ({
  id: "s", numero: 1, stato: "emesso", data: "2026-10-20", note: null, cumulativo: 0, dal: null, al: "2026-10-20",
  precedente: 0, lordo: 0, ritenutaPct: 0.5, ritenuta: 0, recuperoPct: 20, recupero: 0, netto: 0,
  diContratto: true, registro: null, firma: null, voci: [], ...p,
});
const dati = (p: Partial<DatiContratto> = {}): DatiContratto => ({
  permessi: { importi: true, modifica: true }, contratto: contratto(), atti: [], garanzie: [], sal: [], fatture: [], elencoVoci: 0, ...p,
});

describe("il valore contrattuale aggiornato", () => {
  it("è la base ribassata più la sicurezza più gli atti, scomposto voce per voce", () => {
    expect(valoreContratto(contratto(), [atto({ importo: 50_000 })])).toEqual({
      base: 1_000_000, ribasso: 100_000, lavoriNetti: 900_000, sicurezza: 30_000, atti: 50_000, aggiornato: 980_000,
    });
  });

  it("una variante in meno riduce il valore", () => {
    expect(valoreContratto(contratto(), [atto({ importo: 50_000 }), atto({ id: "b", tipo: "variante", importo: -20_000 })])?.aggiornato).toBe(960_000);
  });

  it("senza importo base non c'è ancora un valore da mostrare (il prossimo passo, non uno zero)", () => {
    expect(valoreContratto(contratto({ importoBase: null }), [])).toBeNull();
    expect(valoreContratto(null, [])).toBeNull();
  });

  it("arrotonda il ribasso al centesimo come il database", () => {
    // round(123456.78 * (1 - 12.345/100), 2) = 108216.04 e round(1.005, 2) = 1.01 in Postgres.
    expect(valoreContratto(contratto({ importoBase: 123_456.78, ribassoPct: 12.345, oneriSicurezza: 0 }), [])?.lavoriNetti).toBe(108_216.04);
    expect(arrotonda(1.005)).toBe(1.01);
    expect(arrotonda(0.125)).toBe(0.13);
  });
});

describe("l'elenco prezzi del contratto", () => {
  const voce = (p: Partial<VoceElenco>): VoceElenco => ({
    id: "v", codice: null, descrizione: "Voce", unitaMisura: "m³", prezzo: 10, soggettoRibasso: true, quantitaContratto: null, posizione: 1, ...p,
  });

  it("applica il ribasso solo alle voci soggette", () => {
    expect(prezzoNetto(voce({ prezzo: 120 }), 10)).toBeCloseTo(108);
    expect(prezzoNetto(voce({ prezzo: 50, soggettoRibasso: false }), 10)).toBe(50);
    expect(importoVoce(60, voce({ prezzo: 10 }), 10)).toBe(540);
  });

  it("prezza un ordine di lavoro: Σ quantità × prezzo netto, riga per riga", () => {
    const elenco = new Map([
      ["e1", voce({ id: "e1", prezzo: 10 })],
      ["e2", voce({ id: "e2", prezzo: 120 })],
      ["e3", voce({ id: "e3", prezzo: 50, soggettoRibasso: false })],
    ]);
    expect(importoDaElenco([{ voceId: "e1", quantita: 100 }, { voceId: "e2", quantita: 10 }, { voceId: "e3", quantita: 2 }], elenco, 10)).toBe(2_080);
    // Una voce tolta dall'elenco non conta.
    expect(importoDaElenco([{ voceId: "sparita", quantita: 5 }], elenco, 10)).toBe(0);
  });

  it("per ogni voce dice previsto, eseguito, già a SAL e a finire", () => {
    const m = avanzamentoMisure(
      [{ voceId: "e1", quantita: 100 }],
      [{ voceId: "e1", quantita: 60, salId: "s1" }, { voceId: "e1", quantita: 10, salId: null }, { voceId: "e2", quantita: 3, salId: null }],
    );
    expect(m.get("e1")).toEqual({ prevista: 100, eseguita: 70, inSal: 60, aFinire: 30 });
    // Una misura su una voce fuori computo si vede lo stesso (a finire negativo: oltre il previsto).
    expect(m.get("e2")).toEqual({ prevista: 0, eseguita: 3, inSal: 0, aFinire: -3 });
  });
});

describe("date, penale, anticipazione e ritenute", () => {
  it("le proroghe spostano la fine dei lavori", () => {
    const c = contratto({ dataFinePrevista: "2027-06-30" });
    expect(fineAggiornata(c, [atto({ tipo: "proroga", giorniProroga: 30 }), atto({ id: "b", giorniProroga: 15 })])).toEqual({ data: "2027-08-14", giorni: 45 });
    expect(fineAggiornata(contratto(), [])).toEqual({ data: null, giorni: 0 });
  });

  it("la penale matura dal giorno dopo la fine aggiornata, fino al tetto", () => {
    const c = contratto({ dataFinePrevista: "2026-10-01", penaleGiornaliera: 1_000, penaleMassimaPct: 10 });
    expect(penaleMaturata(c, [], "2026-10-11")).toEqual({ giorni: 10, importo: 10_000, tetto: 93_000, alTetto: false });
    expect(penaleMaturata(c, [], "2027-02-01")?.alTetto).toBe(true);
    expect(penaleMaturata(c, [], "2027-02-01")?.importo).toBe(93_000);
    // In tempo, o lavori ultimati entro la fine: niente penale.
    expect(penaleMaturata(c, [], "2026-09-30")).toBeNull();
    expect(penaleMaturata({ ...c, dataUltimazione: "2026-10-01" }, [], "2027-02-01")).toBeNull();
  });

  it("l'anticipazione da recuperare scende con i SAL emessi, non con le bozze", () => {
    const s = [sal({ recupero: 8_979.2 }), sal({ id: "b", numero: 2, stato: "bozza", recupero: 3_526 })];
    expect(anticipazione(contratto(), s)).toEqual({ importo: 20_000, recuperato: 8_979.2, daRecuperare: 11_020.8 });
  });

  it("propone l'anticipazione come percentuale del valore", () => {
    expect(anticipazioneProposta(contratto(), [atto({ importo: 50_000 })])).toBe(196_000);
    expect(anticipazioneProposta(contratto({ anticipazionePct: 0 }), [])).toBeNull();
  });

  it("ritenute trattenute, svincolate e ancora fuori dal registro", () => {
    const s = [
      sal({ ritenuta: 224.48, registro: { id: "r1", stato: "svincolata", svincolataIl: "2027-01-10" } }),
      sal({ id: "b", numero: 2, ritenuta: 88.15 }),
      sal({ id: "c", numero: 3, stato: "bozza", ritenuta: 50 }),
    ];
    expect(ritenute(s)).toEqual({ trattenute: 312.63, svincolate: 224.48, daSvincolare: 88.15, daRegistrare: 1 });
  });

  it("a SAL è l'ultimo cumulativo emesso; il netto è la somma dei netti", () => {
    const t = totaliSal([
      sal({ numero: 1, cumulativo: 44_896, netto: 35_692.32, al: "2026-10-20" }),
      sal({ id: "b", numero: 2, cumulativo: 62_526, netto: 14_015.85, al: "2026-10-31" }),
      sal({ id: "c", numero: 3, stato: "bozza", cumulativo: 70_000 }),
    ]);
    expect(t).toMatchObject({ emessi: 2, aSal: 62_526, netto: 49_708.17, ultimoAl: "2026-10-31" });
    expect(t.bozza?.id).toBe("c");
  });
});

describe("cosa richiede attenzione nel contratto", () => {
  it("garanzie in scadenza o scadute, la più urgente prima; quelle svincolate no", () => {
    const s = scadenzeContratto(dati({
      garanzie: [
        { id: "g1", tipo: "car", garante: null, numero: null, importo: null, dataEmissione: null, scadenza: "2026-12-15", svincolataIl: null, note: null, allegato: null },
        { id: "g2", tipo: "cauzione_definitiva", garante: null, numero: null, importo: null, dataEmissione: null, scadenza: "2026-10-25", svincolataIl: null, note: null, allegato: null },
        { id: "g3", tipo: "garanzia_anticipazione", garante: null, numero: null, importo: null, dataEmissione: null, scadenza: "2026-11-01", svincolataIl: "2026-10-01", note: null, allegato: null },
        { id: "g4", tipo: "altra", garante: null, numero: null, importo: null, dataEmissione: null, scadenza: "2027-12-01", svincolataIl: null, note: null, allegato: null },
      ],
    }), "2026-10-31");
    expect(s.map((x) => x.id)).toEqual(["garanzia-g2", "garanzia-g1"]);
    expect(s[0]).toMatchObject({ tono: "attenzione", testo: "Cauzione definitiva scaduta il 25/10/2026: chiedi il rinnovo o lo svincolo." });
    expect(s[1]).toMatchObject({ tono: "info", testo: "Polizza CAR scade il 15/12/2026 (tra 45 giorni)." });
  });

  it("lavori oltre la fine con la penale, SAL in bozza e ritenute da registrare", () => {
    const s = scadenzeContratto(dati({
      contratto: contratto({ dataFinePrevista: "2026-10-21", penaleGiornaliera: 500 }),
      sal: [sal({ ritenuta: 10 }), sal({ id: "b", numero: 2, stato: "bozza" })],
    }), "2026-10-31");
    expect(s.map((x) => x.testo)).toEqual([
      `Lavori oltre la fine prevista (21/10/2026) di 10 giorni: penale maturata ${formattaEuroContratto(5_000)}.`,
      "Il SAL n. 2 è in bozza: controllalo ed emettilo.",
      "La ritenuta di un SAL non è ancora nel registro delle ritenute.",
    ]);
  });
});

describe("il modulo del contratto", () => {
  it("dice cosa non va, campo per campo", () => {
    const e = erroriContratto(contratto({ ribassoPct: 100, dataConsegnaLavori: "2027-01-10", dataFinePrevista: "2027-01-01", splitPayment: true, reverseCharge: true }));
    expect(e.ribassoPct).toMatch(/ribasso/);
    expect(e.dataFinePrevista).toMatch(/prima della consegna/);
    expect(e.reverseCharge).toMatch(/non vanno insieme/);
    expect(erroriContratto(contratto())).toEqual({});
  });

  it("traduce gli errori del database nelle parole di chi usa l'app", () => {
    expect(messaggioContratto({ code: "23505", message: "duplicate key" }, "la voce")).toMatch(/stesso codice|questo codice/);
    expect(messaggioContratto({ code: "23503", message: "fk" }, "la voce")).toMatch(/misure/);
    expect(messaggioContratto({ code: "22023", message: "Il valore viene dal contratto." }, "x")).toBe("Il valore viene dal contratto.");
    expect(messaggioContratto({ code: "23514", message: 'new row violates check constraint "x"' }, "il contratto")).toBe("Non è stato possibile salvare il contratto. Riprova tra poco.");
    expect(messaggioContratto(new Error("rete"), "il contratto")).toMatch(/Riprova/);
  });
});

describe("la lettura di generale_contratto_leggi", () => {
  it("senza il permesso degli importi non arriva niente", () => {
    const d = leggiDatiContratto({ permessi: { importi: false, modifica: false } });
    expect(d).toMatchObject({ permessi: { importi: false, modifica: false }, contratto: null, sal: [], atti: [] });
  });

  it("legge contratto, atti, SAL con le voci e il registro, senza fidarsi della forma", () => {
    const d = leggiDatiContratto({
      permessi: { importi: true, modifica: true },
      contratto: { importo_base: "1000000.00", ribasso_pct: "10.0000", oneri_sicurezza: "30000.00", ritenuta_pct: "0.50", split_payment: true, cig: "CIG1" },
      atti: [{ id: "a1", tipo: "proroga", data: "2026-10-01", descrizione: "Proroga 1", importo: "0", giorni_proroga: 30, allegato_id: "f", allegato_percorso: "orders/g/x.pdf", allegato_nome: "atto.pdf" }, { niente: true }],
      sal: [{
        id: "s1", numero: 1, stato: "emesso", cumulativo: "44896.00", lordo: "44896.00", ritenuta: "224.48", recupero: "8979.20", netto: "35692.32",
        di_contratto: true, registro: { id: "r1", stato: "trattenuta" },
        voci: [{ id: "v1", descrizione: "O-0025 · A.01 Scavo", importo_contrattuale: "540.00", percentuale: "100.00", importo: "540.00", tipo: "misure", figlia_id: "f1", quantita: "60.000", prezzo: "9.0000", unita: "m³" }],
      }],
      elenco_voci: 4,
    });
    expect(d.contratto).toMatchObject({ importoBase: 1_000_000, ribassoPct: 10, splitPayment: true, cig: "CIG1", penaleMassimaPct: 10 });
    expect(d.atti).toEqual([expect.objectContaining({ tipo: "proroga", giorniProroga: 30, allegato: { id: "f", nome: "atto.pdf", percorso: "orders/g/x.pdf" } })]);
    expect(d.sal[0]).toMatchObject({ netto: 35_692.32, registro: { id: "r1", stato: "trattenuta", svincolataIl: null } });
    expect(d.sal[0].voci[0]).toMatchObject({ tipo: "misure", figliaId: "f1", quantita: 60, prezzo: 9 });
    expect(d.elencoVoci).toBe(4);
  });
});
