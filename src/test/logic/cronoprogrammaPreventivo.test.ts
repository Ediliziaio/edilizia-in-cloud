/**
 * Il cronoprogramma del preventivo (26/10/2026): le fasi di QUESTO lavoro vincono su quelle del modello, che
 * raccontavano gli stessi tempi per tutti. Senza fasi proprie non cambia niente.
 */
import { describe, expect, it } from "vitest";
import {
  durataComplessiva, fasiDaStampare, fasiDiPartenza, leggiCronoprogramma, MAX_FASI_CRONO,
} from "@/lib/preventivi/cronoprogramma";
import { costruisciDatiEdile, leggiModello, type ProgettoComune } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";

const PROGETTO: ProgettoComune = {
  code: "RST-1", tipo_intervento: "Ristrutturazione completa", cliente_nome: "Mario", cliente_cognome: "Rossi",
  cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Torino", cantiere_provincia: "TO", cantiere_cap: "10100",
  immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
};
const DEL_MODELLO = [{ fase: "Fase del modello", durata: "1 settimana" }];

describe("lettura delle fasi", () => {
  it("legge nome, durata e descrizione; quello che non è un elenco non è un cronoprogramma", () => {
    const f = leggiCronoprogramma([{ fase: " Demolizioni ", durata: " 3 giorni ", descrizione: " con smaltimento " }])!;
    expect(f[0]).toEqual({ fase: "Demolizioni", durata: "3 giorni", descrizione: "con smaltimento" });
    for (const v of [null, undefined, {}, "x", []]) expect(leggiCronoprogramma(v)).toBeNull();
  });

  it("oltre venti fasi non entrano, e i campi lunghi si accorciano", () => {
    const tante = Array.from({ length: 30 }, (_, i) => ({ fase: `F${i}` }));
    expect(leggiCronoprogramma(tante)).toHaveLength(MAX_FASI_CRONO);
    expect(leggiCronoprogramma([{ fase: "x".repeat(200) }])![0].fase.length).toBe(80);
  });

  it("una fase senza nome non si stampa: una riga lasciata a metà non va al cliente", () => {
    expect(fasiDaStampare([{ fase: "Posa", durata: null, descrizione: null }, { fase: "  ", durata: "2 giorni", descrizione: null }])).toHaveLength(1);
  });
});

describe("durata complessiva", () => {
  it("somma le durate e le dice nell'unità che si legge meglio", () => {
    expect(durataComplessiva([{ fase: "a", durata: "2 giorni", descrizione: null }, { fase: "b", durata: "3 giorni", descrizione: null }])).toBe("5 giorni");
    expect(durataComplessiva([{ fase: "a", durata: "2 settimane", descrizione: null }, { fase: "b", durata: "1 settimana", descrizione: null }])).toBe("circa 3 settimane");
    expect(durataComplessiva([{ fase: "a", durata: "2 mesi", descrizione: null }, { fase: "b", durata: "1 mese", descrizione: null }])).toBe("circa 3 mesi");
  });

  it("se una durata non si capisce non si inventa un totale", () => {
    expect(durataComplessiva([{ fase: "a", durata: "quando si può", descrizione: null }])).toBeNull();
    expect(durataComplessiva([])).toBeNull();
  });
});

describe("fasi di partenza", () => {
  it("ogni mestiere ha le sue, e tutte hanno nome e durata", () => {
    for (const m of ["ristrutturazione", "bagni", "tetti", "climatizzazione", "elettrico", "termoidraulico", "pavimenti", "piscine"]) {
      const fasi = fasiDiPartenza(m);
      expect(fasi.length, m).toBeGreaterThanOrEqual(4);
      expect(fasi.every((f) => f.fase.trim() && f.durata), m).toBe(true);
      expect(durataComplessiva(fasi), m).toBeTruthy();
    }
  });

  it("un mestiere che non si conosce ha comunque tre passi sensati", () => {
    expect(fasiDiPartenza("chissà").map((f) => f.fase)).toEqual(["Preparazione del cantiere", "Lavorazioni", "Finiture e consegna"]);
  });

  it("le fasi di un bagno non sono quelle di una ristrutturazione", () => {
    expect(fasiDiPartenza("bagni")).not.toEqual(fasiDiPartenza("ristrutturazione"));
  });
});

describe("nel documento", () => {
  const modello = (progetto: ProgettoComune) => leggiModello({ cronoprogramma: DEL_MODELLO }, { progetto, azienda: null });

  it("le fasi del preventivo vincono su quelle del modello", () => {
    const m = modello({ ...PROGETTO, cronoprogramma: [{ fase: "Demolizioni", durata: "4 giorni" }, { fase: "Finiture", durata: "1 settimana" }] } as ProgettoComune);
    expect(m.cronoprogramma.map((f) => f.fase)).toEqual(["Demolizioni", "Finiture"]);
  });

  it("senza fasi proprie resta il cronoprogramma del modello, come prima", () => {
    expect(modello(PROGETTO).cronoprogramma.map((f) => f.fase)).toEqual(["Fase del modello"]);
    expect(modello({ ...PROGETTO, cronoprogramma: [] } as ProgettoComune).cronoprogramma.map((f) => f.fase)).toEqual(["Fase del modello"]);
    expect(modello({ ...PROGETTO, cronoprogramma: [{ fase: "   " }] } as ProgettoComune).cronoprogramma.map((f) => f.fase)).toEqual(["Fase del modello"]);
  });

  it("arriva fino ai dati del PDF", () => {
    const dati = costruisciDatiEdile({
      modulo: MODULI_EDILI.ristrutturazione,
      progetto: { ...PROGETTO, cronoprogramma: [{ fase: "Impianti", durata: "2 settimane" }] } as ProgettoComune,
      template: { cronoprogramma: DEL_MODELLO }, azienda: null, capitoli: [], media: [],
      totali: { imponibileLordo: 1000, scontoEur: 0, scontoPct: 0, imponibile: 1000, iva: 100, ivaPct: 10, totale: 1100, detrazionePct: 0, detrazioneEur: 0, costoTot: 600, margineEur: 400, marginePct: 40 },
    });
    expect(dati.modello.cronoprogramma).toEqual([{ fase: "Impianti", durata: "2 settimane", descrizione: null }]);
  });
});
