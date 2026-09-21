/**
 * I codici dei preventivatori edili nel PDF del cliente.
 *
 * Il preventivatore salva «rifacimento_completo», il cliente deve leggere
 * «Rifacimento completo del bagno». Fino al 22/09/2026 il PDF stampava il codice.
 * Qui si controlla che ogni scelta dei preventivatori abbia la sua parola, e
 * che la rata di esempio del modello arrivi fino al documento.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COSTRUZIONI_PISCINA, GENERATORI, IMMOBILI, INTERVENTI, LIVELLI_IMPIANTO_ELETTRICO, MATERIALI_PAVIMENTO,
  TIPI_PISCINA, TIPOLOGIE_CLIMA, parolaDelCodice, unitaInParole, type Dizionario,
} from "@/components/preventivi/pdf/paroleDeiCodici";
import { costruisciDatiEdile, type ProgettoComune } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";
import { normalizeTemplate as modelloBagni } from "@/hooks/useBagniProgetto";
import { normalizeTemplate as modelloRistrutturazione } from "@/hooks/useRistrutturazioneProgetto";
import { normalizeTemplate as modelloTetti } from "@/hooks/useTettiProgetto";
import { normalizeTemplate as modelloClima } from "@/hooks/useClimatizzazioneProgetto";
import { normalizeTemplate as modelloElettrico } from "@/hooks/useElettricoProgetto";
import { normalizeTemplate as modelloTermoidraulico } from "@/hooks/useTermoidraulicoProgetto";
import { normalizeTemplate as modelloPavimenti } from "@/hooks/usePavimentiProgetto";
import { normalizeTemplate as modelloPiscine } from "@/hooks/usePiscineProgetto";

const PREVENTIVATORI = {
  bagni: "bagni/BagniWizard",
  ristrutturazione: "ristrutturazione/RistrutturazioneWizard",
  tetti: "tetti/TettiWizard",
  climatizzazione: "climatizzazione/ClimatizzazioneWizard",
  elettrico: "elettrico/ElettricoWizard",
  termoidraulico: "termoidraulico/TermoidraulicoWizard",
  pavimenti: "pavimenti/PavimentiWizard",
  piscine: "piscine/PiscineWizard",
} as const;

/** I codici di un elenco di scelte (`const NOME = [{ value: "…", label: "…" }, …] as const;`) nello StepImmobile. */
function codiciDi(mestiere: keyof typeof PREVENTIVATORI, elenco: string): string[] {
  const sorgente = readFileSync(resolve(__dirname, `../../pages/azienda/${PREVENTIVATORI[mestiere]}/StepImmobile.tsx`), "utf8");
  const inizio = sorgente.indexOf(`const ${elenco} = [`);
  expect(inizio, `${elenco} nel preventivatore ${mestiere}`).toBeGreaterThanOrEqual(0);
  // L'elenco finisce alla prima parentesi quadra chiusa a inizio riga.
  const corpo = sorgente.slice(inizio, sorgente.indexOf("\n]", inizio));
  return [...corpo.matchAll(/value: "([^"]+)"/g)].map((m) => m[1]).filter((c) => c !== "altro");
}

function senzaParola(codici: string[], dizionario: Dizionario): string[] {
  return codici.filter((c) => !dizionario[c]);
}

describe("ogni scelta dei preventivatori ha la sua parola nel PDF", () => {
  for (const mestiere of Object.keys(PREVENTIVATORI) as Array<keyof typeof PREVENTIVATORI>) {
    it(`${mestiere}: intervento e immobile`, () => {
      expect(senzaParola(codiciDi(mestiere, "TIPI_INTERVENTO"), INTERVENTI[mestiere])).toEqual([]);
      expect(senzaParola(codiciDi(mestiere, "TIPI_IMMOBILE"), IMMOBILI)).toEqual([]);
    });
  }

  it("i dati propri dei mestieri", () => {
    expect(senzaParola(codiciDi("climatizzazione", "TIPI_IMPIANTO"), TIPOLOGIE_CLIMA)).toEqual([]);
    expect(senzaParola(codiciDi("elettrico", "LIVELLI_IMPIANTO"), LIVELLI_IMPIANTO_ELETTRICO)).toEqual([]);
    expect(senzaParola(codiciDi("termoidraulico", "TIPI_GENERATORE"), GENERATORI)).toEqual([]);
    expect(senzaParola(codiciDi("pavimenti", "TIPI_MATERIALE"), MATERIALI_PAVIMENTO)).toEqual([]);
    expect(senzaParola(codiciDi("piscine", "TIPI_PISCINA"), TIPI_PISCINA)).toEqual([]);
    expect(senzaParola(codiciDi("piscine", "TIPI_COSTRUZIONE"), COSTRUZIONI_PISCINA)).toEqual([]);
  });
});

describe("la parola del codice", () => {
  it("un testo scritto a mano resta com'è, un codice sconosciuto perde i trattini bassi, «altro» non esce", () => {
    expect(parolaDelCodice("Rifacimento bagno completo", IMMOBILI)).toBe("Rifacimento bagno completo");
    expect(parolaDelCodice("mansarda_abitabile", IMMOBILI)).toBe("Mansarda abitabile");
    expect(parolaDelCodice("altro", IMMOBILI)).toBeNull();
    expect(parolaDelCodice("  ", IMMOBILI)).toBeNull();
  });

  it("«corpo» si scrive «a corpo»", () => {
    expect(unitaInParole("corpo")).toBe("a corpo");
    expect(unitaInParole("mq")).toBe("mq");
    expect(unitaInParole(null)).toBeNull();
  });
});

describe("il PDF non stampa più i codici", () => {
  const PROGETTO: ProgettoComune = {
    code: "BGN-2026-001", tipo_intervento: "rifacimento_completo",
    cliente_nome: "Giulia", cliente_cognome: "Ferrari",
    cantiere_indirizzo: "Via Marco Polo 18", cantiere_citta: "Monza", cantiere_provincia: "MB", cantiere_cap: "20900",
    immobile_tipo: "casa_indipendente", immobile_superficie_mq: 90, immobile_anno: 1982, immobile_piani: 1,
  };
  const TOTALI = {
    imponibileLordo: 1000, scontoEur: 0, scontoPct: 0, imponibile: 1000, iva: 100, ivaPct: 10, totale: 1100,
    detrazionePct: 0, detrazioneEur: 0, costoTot: 600, margineEur: 400, marginePct: 40,
  };

  it("scheda, riepilogo, copertina, segnaposto e unità di misura", () => {
    const dati = costruisciDatiEdile({
      modulo: MODULI_EDILI.bagni, progetto: PROGETTO, azienda: null, totali: TOTALI, media: [],
      template: { cover_title: "Il preventivo per {tipo_intervento}" },
      capitoli: [{ nome: "Sanitari", subtotale: 1000, voci: [{ id: "1", descrizione: "Mobile lavabo", unita_misura: "corpo", quantita: 1, prezzo_unitario: 1000, importo: 1000 }] }],
    });
    expect(dati.tipoIntervento).toBe("Rifacimento completo del bagno");
    expect(dati.scheda).toContainEqual({ etichetta: "Intervento", valore: "Rifacimento completo del bagno" });
    expect(dati.scheda).toContainEqual({ etichetta: "Immobile", valore: "Casa indipendente" });
    expect(dati.modello.copertina.titolo).toBe("Il preventivo per rifacimento completo del bagno");
    expect(dati.capitoli[0].voci[0].unitaMisura).toBe("a corpo");
    expect(JSON.stringify(dati)).not.toMatch(/rifacimento_completo|casa_indipendente/);
  });
});

describe("la rata di esempio del modello arriva al PDF", () => {
  const NORMALIZZATORI = [
    modelloBagni, modelloRistrutturazione, modelloTetti, modelloClima,
    modelloElettrico, modelloTermoidraulico, modelloPavimenti, modelloPiscine,
  ];
  const promo = { attivo: true, rate: 84, tan_pct: 6.9 };

  it("negli otto moduli il caricamento del modello la tiene", () => {
    for (const normalizza of NORMALIZZATORI) {
      expect(normalizza({ finanziamento_promo: promo }, "azienda").finanziamento_promo).toEqual(promo);
      expect(normalizza({}, "azienda").finanziamento_promo).toBeNull();
    }
  });

  it("e il documento la mostra sotto il totale", () => {
    const dati = costruisciDatiEdile({
      modulo: MODULI_EDILI.ristrutturazione,
      progetto: { ...{ code: null, cliente_nome: null, cliente_cognome: null, cantiere_indirizzo: null, cantiere_citta: null, cantiere_provincia: null, cantiere_cap: null, immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null }, tipo_intervento: null, immobile_tipo: null },
      template: modelloRistrutturazione({ finanziamento_promo: promo }, "azienda") as unknown as Record<string, unknown>,
      azienda: null, capitoli: [], media: [],
      totali: { imponibileLordo: 0, scontoEur: 0, scontoPct: 0, imponibile: 0, iva: 0, ivaPct: 10, totale: 0, detrazionePct: 0, detrazioneEur: 0, costoTot: 0, margineEur: 0, marginePct: 0 },
    });
    expect(dati.modello.finanziamentoPromo).toEqual(promo);
  });
});
