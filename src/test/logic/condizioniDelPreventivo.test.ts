/**
 * Le condizioni contrattuali del singolo preventivo (27/10/2026): il PDF può uscire senza, e le condizioni si
 * possono riscrivere per un cliente solo. Ma il PDF che va in FIRMA le ha sempre: il firmato è il contratto.
 */
import { describe, expect, it } from "vitest";
import {
  condizioniRiscritte, condizioniTolteDalPdf, haTesto, perLaFirma, puoRiscrivereLeCondizioni, testoCondizioniDelPdf,
} from "@/lib/preventivi/condizioniDelPreventivo";
import { leggiModello, type ProgettoComune } from "@/components/preventivi/pdf/adattatoreEdile";

const DEL_MODELLO = "<p>Art. 1 — Condizioni del modello.</p>";
const PROPRIE = "<p>Art. 1 — Condizioni scritte per questo cliente.</p>";

describe("quale testo stampa il PDF", () => {
  it("senza niente di suo stampa quelle del modello", () => {
    expect(testoCondizioniDelPdf(null, DEL_MODELLO)).toBe(DEL_MODELLO);
    expect(testoCondizioniDelPdf({}, DEL_MODELLO)).toBe(DEL_MODELLO);
    expect(testoCondizioniDelPdf({ condizioni_testo: "   " }, DEL_MODELLO)).toBe(DEL_MODELLO);
    expect(testoCondizioniDelPdf({ condizioni_testo: "<p> </p>" }, DEL_MODELLO)).toBe(DEL_MODELLO);
  });

  it("le condizioni scritte per questo preventivo vincono su quelle del modello", () => {
    expect(testoCondizioniDelPdf({ condizioni_testo: PROPRIE }, DEL_MODELLO)).toBe(PROPRIE);
  });

  it("col preventivo impostato «senza» non stampa niente, nemmeno le sue", () => {
    expect(testoCondizioniDelPdf({ condizioni_nel_pdf: false }, DEL_MODELLO)).toBe("");
    expect(testoCondizioniDelPdf({ condizioni_nel_pdf: false, condizioni_testo: PROPRIE }, DEL_MODELLO)).toBe("");
  });

  it("solo false toglie le condizioni: null e true le lasciano", () => {
    for (const v of [null, undefined, true]) expect(testoCondizioniDelPdf({ condizioni_nel_pdf: v }, DEL_MODELLO), String(v)).toBe(DEL_MODELLO);
  });
});

describe("il PDF che va in firma", () => {
  it("rimette le condizioni anche se il preventivo è impostato «senza»", () => {
    const senza = { condizioni_nel_pdf: false as const, condizioni_testo: null as string | null };
    expect(testoCondizioniDelPdf(perLaFirma(senza), DEL_MODELLO)).toBe(DEL_MODELLO);
  });

  it("in firma restano le condizioni scritte per quel cliente, non quelle del modello", () => {
    expect(testoCondizioniDelPdf(perLaFirma({ condizioni_nel_pdf: false as const, condizioni_testo: PROPRIE }), DEL_MODELLO)).toBe(PROPRIE);
  });

  it("un preventivo già «con» non viene toccato: stesso oggetto, nessuna copia inutile", () => {
    const con = { condizioni_testo: PROPRIE };
    expect(perLaFirma(con)).toBe(con);
  });

  it("non cambia il preventivo salvato: la scelta «senza» resta per i prossimi PDF", () => {
    const senza = { condizioni_nel_pdf: false as const };
    perLaFirma(senza);
    expect(senza.condizioni_nel_pdf).toBe(false);
  });
});

describe("chi può riscrivere le condizioni", () => {
  it("chi gestisce i modelli e gli amministratori sì, i venditori no", () => {
    expect(puoRiscrivereLeCondizioni({ canEditSettingsPricing: true })).toBe(true);
    expect(puoRiscrivereLeCondizioni({ isAdmin: true })).toBe(true);
    expect(puoRiscrivereLeCondizioni({ isAdmin: false, canEditSettingsPricing: false })).toBe(false);
  });

  it("finché i permessi non sono arrivati non si può: mai un permesso dato per scontato", () => {
    expect(puoRiscrivereLeCondizioni({ isAdmin: true, isLoading: true })).toBe(false);
    expect(puoRiscrivereLeCondizioni(null)).toBe(false);
  });
});

describe("come si legge lo stato", () => {
  it("riconosce le condizioni riscritte e il PDF senza condizioni", () => {
    expect(condizioniRiscritte({ condizioni_testo: PROPRIE })).toBe(true);
    expect(condizioniRiscritte({ condizioni_testo: "<p></p>" })).toBe(false);
    expect(condizioniTolteDalPdf({ condizioni_nel_pdf: false })).toBe(true);
    expect(condizioniTolteDalPdf({})).toBe(false);
    expect(haTesto("<p>&nbsp;</p>")).toBe(false);
  });
});

describe("nel documento vero", () => {
  const PROGETTO: ProgettoComune = {
    code: "RST-1", tipo_intervento: "Ristrutturazione", cliente_nome: "Mario", cliente_cognome: "Rossi",
    cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Torino", cantiere_provincia: "TO", cantiere_cap: "10100",
    immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
  };
  const modello = (progetto: ProgettoComune) =>
    leggiModello({ condizioni_legali_testo: DEL_MODELLO }, { progetto, azienda: null });

  it("il preventivo «senza» esce senza parte contrattuale", () => {
    expect(modello({ ...PROGETTO, condizioni_nel_pdf: false } as ProgettoComune).condizioniLegali).toEqual([]);
  });

  it("il preventivo normale le ha, e quello con le sue stampa le sue", () => {
    expect(modello(PROGETTO).condizioniLegali.length).toBeGreaterThan(0);
    const proprie = modello({ ...PROGETTO, condizioni_testo: PROPRIE } as ProgettoComune).condizioniLegali;
    expect(JSON.stringify(proprie)).toContain("questo cliente");
  });

  it("mandato in firma, lo stesso preventivo «senza» le ritrova", () => {
    const senza = { ...PROGETTO, condizioni_nel_pdf: false } as ProgettoComune;
    expect(modello(perLaFirma(senza)).condizioniLegali.length).toBeGreaterThan(0);
  });
});
