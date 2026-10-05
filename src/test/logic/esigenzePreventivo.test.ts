/**
 * Le esigenze del cliente scelte per il singolo preventivo («freddo», «spifferi»,
 * «bolletta alta»…). La regola che qui si difende è una sola: sono FACOLTATIVE e lo
 * standard del PDF non cambia. Senza nessuna scelta il documento esce identico a
 * prima; con una scelta, escono quelle (negli edili al posto dell'elenco scritto nel
 * modello dell'azienda, in Serramenti le prime tre).
 */
import { describe, expect, it } from "vitest";
import {
  alternaEsigenza,
  chiaveEsigenza,
  esigenzaScelta,
  esigenzeDelPreventivo,
  leggiEsigenze,
  type EsigenzaCliente,
} from "@/lib/preventivatore/esigenze";
import { ESIGENZE_DI_SERIE, ESIGENZE_DI_SERIE_SERRAMENTI } from "@/lib/preventivatore/esigenzeDiSerie";
import { leggiModello, type AziendaComune, type ProgettoComune } from "@/components/preventivi/pdf/adattatoreEdile";
import { anteprimaComputo, type VoceComputoAnteprima } from "@/lib/preventivatore/anteprimaComputo";
import * as calcoliBagni from "@/lib/bagni/calcoli";
import { ESIGENZE_NEL_PDF_SERRAMENTI, anteprimaSerramenti } from "@/lib/serramenti/anteprima";
import type { SrProgettoRow } from "@/types/serramenti";

describe("lettura e scelta delle esigenze", () => {
  it("dal jsonb del database a un elenco pulito: solo voci con titolo, senza doppioni", () => {
    const letto = leggiEsigenze([
      { titolo: "  Freddo d'inverno ", descrizione: " Isoliamo. " },
      { titolo: "freddo   d'inverno", descrizione: "doppione, con maiuscole e spazi diversi" },
      { titolo: "", descrizione: "senza titolo" },
      { descrizione: "titolo mancante" },
      { titolo: "Spifferi", descrizione: "   " },
      { titolo: "Muffa" },
      null,
      "una stringa",
      42,
    ]);
    expect(letto).toEqual([
      { titolo: "Freddo d'inverno", descrizione: "Isoliamo." },
      { titolo: "Spifferi", descrizione: null },
      { titolo: "Muffa", descrizione: null },
    ]);
  });

  it("tutto ciò che non è un elenco vale «nessuna scelta» (null e [] sono lo stesso)", () => {
    for (const v of [undefined, null, [], {}, "x", 7, true]) expect(leggiEsigenze(v)).toEqual([]);
    expect(esigenzeDelPreventivo(null)).toEqual([]);
    expect(esigenzeDelPreventivo(undefined)).toEqual([]);
    expect(esigenzeDelPreventivo({})).toEqual([]);
    expect(esigenzeDelPreventivo({ esigenze: null })).toEqual([]);
    expect(esigenzeDelPreventivo({ esigenze: [{ titolo: "Muffa" }] })).toEqual([{ titolo: "Muffa", descrizione: null }]);
  });

  it("la chiave è il titolo senza badare a maiuscole e spazi", () => {
    expect(chiaveEsigenza("  Bolletta   ALTA ")).toBe("bolletta alta");
    expect(esigenzaScelta([{ titolo: "Bolletta alta" }], { titolo: "BOLLETTA  alta" })).toBe(true);
    expect(esigenzaScelta([{ titolo: "Bolletta alta" }], { titolo: "Rumore" })).toBe(false);
  });

  it("spuntare una voce ne COPIA il testo; ritoccare la libreria dopo non cambia i preventivi già fatti", () => {
    const voce: EsigenzaCliente = { titolo: "Rumore", descrizione: "Vetri stratificati." };
    const scelte = alternaEsigenza([], voce);
    expect(scelte).toEqual([{ titolo: "Rumore", descrizione: "Vetri stratificati." }]);
    // È una copia, non lo stesso oggetto della libreria.
    expect(scelte[0]).not.toBe(voce);
    voce.descrizione = "Testo cambiato dopo";
    expect(scelte[0].descrizione).toBe("Vetri stratificati.");
  });

  it("toccarla di nuovo la toglie, senza modificare l'elenco di partenza", () => {
    const partenza: EsigenzaCliente[] = [{ titolo: "Rumore" }, { titolo: "Muffa" }];
    const senza = alternaEsigenza(partenza, { titolo: "rumore" });
    expect(senza.map((s) => s.titolo)).toEqual(["Muffa"]);
    expect(partenza).toHaveLength(2);
  });
});

/** I font dei PDF sono WinAnsi: Latin-1 più poche punteggiature. Una freccia o un meno tondo spariscono. */
const WIN_ANSI = /^[\u0020-\u007E\u00A0-\u00FF\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u20AC\u2022]*$/;

describe("le esigenze di serie dei moduli", () => {
  const moduli = Object.entries(ESIGENZE_DI_SERIE);

  it("ogni modulo edile ne ha di pronte, senza doppioni", () => {
    expect(moduli.map(([m]) => m).sort()).toEqual(
      ["bagni", "climatizzazione", "elettrico", "pavimenti", "piscine", "ristrutturazione", "termoidraulico", "tetti"],
    );
    for (const [modulo, voci] of moduli) {
      expect(voci.length, modulo).toBeGreaterThanOrEqual(5);
      const chiavi = voci.map((v) => chiaveEsigenza(v.titolo));
      expect(new Set(chiavi).size, `${modulo}: titoli doppi`).toBe(chiavi.length);
    }
  });

  it("titoli da etichetta, testi da frase: stanno nel PDF senza sfondare la colonna", () => {
    for (const [modulo, voci] of [...moduli, ["serramenti", ESIGENZE_DI_SERIE_SERRAMENTI] as const]) {
      for (const v of voci) {
        expect(v.titolo.length, `${modulo}: «${v.titolo}»`).toBeLessThanOrEqual(60);
        expect(v.descrizione?.trim().length ?? 0, `${modulo}: «${v.titolo}» senza testo`).toBeGreaterThan(30);
        expect(v.descrizione!.length, `${modulo}: «${v.titolo}» troppo lungo`).toBeLessThanOrEqual(260);
      }
    }
  });

  it("si leggono nei font del PDF: niente frecce, apici, meno tondi né emoji", () => {
    for (const [modulo, voci] of [...moduli, ["serramenti", ESIGENZE_DI_SERIE_SERRAMENTI] as const]) {
      for (const v of voci) {
        expect(v.titolo, `${modulo}: titolo`).toMatch(WIN_ANSI);
        expect(v.descrizione ?? "", `${modulo}: «${v.titolo}»`).toMatch(WIN_ANSI);
      }
    }
  });

  it("non promettono numeri: una percentuale la scrive l'azienda, se la può mantenere", () => {
    for (const [modulo, voci] of [...moduli, ["serramenti", ESIGENZE_DI_SERIE_SERRAMENTI] as const]) {
      for (const v of voci) {
        expect(`${v.titolo} ${v.descrizione ?? ""}`, `${modulo}: «${v.titolo}»`).not.toMatch(/\d\s*%|garantit|sicuramente|100\s*%/i);
      }
    }
  });

  it("Serramenti riusa i suoi testi già scritti (nessuna copia che si allontana)", () => {
    expect(ESIGENZE_DI_SERIE_SERRAMENTI.map((v) => v.titolo)).toEqual(
      expect.arrayContaining(["Spifferi e correnti d'aria", "Condensa e muffa al mattino", "Rumore dalla strada che ti sveglia"]),
    );
    expect(ESIGENZE_DI_SERIE_SERRAMENTI.length).toBeGreaterThanOrEqual(6);
  });
});

describe("il PDF dei moduli edili: le esigenze del preventivo, lo standard se non ce ne sono", () => {
  const PROGETTO: ProgettoComune = {
    code: "BGN-2026-014", tipo_intervento: "Ristrutturazione completa",
    cliente_nome: "Mario", cliente_cognome: "Rossi",
    cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
    immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
  };
  const contesto = (esigenze?: unknown) => ({
    progetto: esigenze === undefined ? PROGETTO : { ...PROGETTO, esigenze },
    azienda: null as AziendaComune | null,
  });
  const LIBRERIA = [
    { titolo: "Bollette energetiche elevate", descrizione: "Dal modello dell'azienda." },
    { titolo: "Impianto vecchio o rumoroso", descrizione: "Dal modello dell'azienda." },
    { titolo: "", descrizione: "una voce senza titolo non esce" },
  ];
  const modello = { esigenze: LIBRERIA };

  it("senza scelte il documento è IDENTICO a prima: l'elenco del modello dell'azienda", () => {
    const prima = leggiModello(modello, contesto());
    expect(prima.esigenze.map((e) => e.titolo)).toEqual(["Bollette energetiche elevate", "Impianto vecchio o rumoroso"]);
    // Niente, null, [], voci vuote o rovinate: tutte «nessuna scelta» → stesso identico risultato.
    for (const nessuna of [null, [], {}, "x", [{ titolo: "   " }, { descrizione: "x" }, null]]) {
      expect(leggiModello(modello, contesto(nessuna)), `esigenze = ${JSON.stringify(nessuna)}`).toEqual(prima);
    }
  });

  it("senza scelte e senza elenco nel modello il capitolo non c'è (come sempre)", () => {
    expect(leggiModello({}, contesto()).esigenze).toEqual([]);
    expect(leggiModello({}, contesto([])).esigenze).toEqual([]);
  });

  it("con una scelta escono SOLO quelle del preventivo, al posto dell'elenco del modello", () => {
    const m = leggiModello(modello, contesto([
      { titolo: "Spifferi dalle finestre", descrizione: "Per questo cliente: sigillature e guarnizioni." },
      { titolo: "Muffa in camera" },
    ]));
    expect(m.esigenze).toEqual([
      { titolo: "Spifferi dalle finestre", descrizione: "Per questo cliente: sigillature e guarnizioni." },
      { titolo: "Muffa in camera", descrizione: null },
    ]);
  });

  it("la scelta vale anche quando il modello dell'azienda non ha nessun elenco", () => {
    const m = leggiModello({}, contesto([{ titolo: "Bolletta alta", descrizione: "Confrontiamo i consumi." }]));
    expect(m.esigenze).toEqual([{ titolo: "Bolletta alta", descrizione: "Confrontiamo i consumi." }]);
  });

  it("il resto del documento non si muove: soluzione e altri elenchi restano quelli del modello", () => {
    const t = { esigenze: LIBRERIA, soluzione: [{ titolo: "Un solo referente", descrizione: "x" }] };
    const senza = leggiModello(t, contesto());
    const con = leggiModello(t, contesto([{ titolo: "Muffa" }]));
    expect({ ...con, esigenze: [] }).toEqual({ ...senza, esigenze: [] });
  });
});

describe("l'anteprima a destra: le esigenze compaiono solo se scelte", () => {
  const VOCI: VoceComputoAnteprima[] = [{
    id: "a", capitolo_nome: "Demolizioni", descrizione: "Rimozione sanitari", unita_misura: "cad", quantita: 1,
    prezzo_unitario: 500, sconto_pct: 0, costo_materiali: 0, costo_manodopera: 0,
  }];
  const opzioni = { emittente: "Bianchi", ivaDefault: 10, oggi: new Date(2026, 9, 5) };

  it("edili: senza scelte l'anteprima è quella di sempre (nemmeno la chiave)", () => {
    const a = anteprimaComputo(VOCI, { code: "BGN-1" }, calcoliBagni, opzioni);
    expect("esigenze" in a).toBe(false);
    expect("esigenze" in anteprimaComputo(VOCI, { code: "BGN-1", esigenze: [] }, calcoliBagni, opzioni)).toBe(false);
    expect("esigenze" in anteprimaComputo(VOCI, { code: "BGN-1", esigenze: null }, calcoliBagni, opzioni)).toBe(false);
  });

  it("edili: con le scelte ci sono i titoli, con l'intestazione che usa il PDF", () => {
    const a = anteprimaComputo(
      VOCI,
      { code: "BGN-1", esigenze: [{ titolo: "Muffa e umidità alle pareti", descrizione: "lungo testo che nell'anteprima non serve" }, { titolo: "Bagno datato" }] },
      calcoliBagni,
      opzioni,
    );
    expect(a.esigenze).toEqual({ titolo: "Da dove partiamo", voci: ["Muffa e umidità alle pareti", "Bagno datato"] });
  });

  it("Serramenti: mostra le stesse prime tre che stampa il PDF, con l'intestazione del PDF", () => {
    const form = {
      id: "p1", code: "SR-1", iva_percentuale: 10,
      esigenze: [1, 2, 3, 4, 5].map((n) => ({ titolo: `Esigenza ${n}`, descrizione: "testo" })),
    } as unknown as Partial<SrProgettoRow>;
    const a = anteprimaSerramenti(form, undefined, { oggi: new Date("2026-10-05T10:00:00") });
    expect(ESIGENZE_NEL_PDF_SERRAMENTI).toBe(3);
    expect(a.esigenze).toEqual({ titolo: "Le tue esigenze", voci: ["Esigenza 1", "Esigenza 2", "Esigenza 3"] });
  });

  it("Serramenti: senza scelte niente sezione", () => {
    const a = anteprimaSerramenti({ id: "p1", code: "SR-1" } as unknown as Partial<SrProgettoRow>, undefined, { oggi: new Date("2026-10-05T10:00:00") });
    expect("esigenze" in a).toBe(false);
  });
});
