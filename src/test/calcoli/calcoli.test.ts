import { describe, it, expect } from "vitest";
import {
  calcolaCongruita,
  CATEGORIE_CONGRUITA,
  getCategoria,
  SOGLIA_PRIVATI_EUR,
} from "@/lib/calcoli/congruita";
import { calcolaCostoOrario } from "@/lib/calcoli/costoOrario";
import { calcolaRitenuta } from "@/lib/calcoli/ritenuta";

/* ─────────────────────────────── CONGRUITÀ ─────────────────────────────── */

describe("congruità manodopera (DM 143/2021)", () => {
  it("la tabella ha le 17 righe del decreto e nessun id duplicato", () => {
    expect(CATEGORIE_CONGRUITA).toHaveLength(17);
    const ids = new Set(CATEGORIE_CONGRUITA.map((c) => c.id));
    expect(ids.size).toBe(17);
  });

  it("riporta i valori ufficiali, inclusi quelli spesso citati sbagliati", () => {
    // Verificati sul PDF del Ministero del Lavoro, non a memoria.
    expect(getCategoria("og1-nuova-civile")?.incidenza).toBe(14.28);
    expect(getCategoria("ristrutturazione-civile")?.incidenza).toBe(22.0);
    expect(getCategoria("og2-restauro")?.incidenza).toBe(30.0);
    // OG5 è 16,07% — la cifra 16,25% che circola online è errata.
    expect(getCategoria("og5-dighe")?.incidenza).toBe(16.07);
    // OG6 gasdotti/oleodotti è 13,66% — non 13,10%.
    expect(getCategoria("og6-gasdotti")?.incidenza).toBe(13.66);
    expect(getCategoria("og6-oleodotti")?.incidenza).toBe(13.66);
  });

  it("l'esempio dell'articolo torna: 400.000 € al 22% ⇒ attesa 88.000 €", () => {
    const r = calcolaCongruita({
      valoreOpera: 400_000,
      manodoperaDenunciata: 74_000,
      categoriaId: "ristrutturazione-civile",
      pubblico: false,
    });
    expect(r.manodoperaAttesa).toBe(88_000);
    expect(r.incidenzaCalcolata).toBe(18.5);
    expect(r.scostamento).toBe(14_000);
    expect(r.congruo).toBe(false);
  });

  it("è congruo quando la manodopera raggiunge esattamente la soglia", () => {
    const r = calcolaCongruita({
      valoreOpera: 400_000,
      manodoperaDenunciata: 88_000,
      categoriaId: "ristrutturazione-civile",
      pubblico: false,
    });
    expect(r.congruo).toBe(true);
    expect(r.scostamento).toBe(0);
  });

  it("NON dichiara congruo un cantiere che arrotonda a soglia ma sta sotto", () => {
    // 87.984 € su 400.000 = 21,996%, che arrotondato mostra 22,00%.
    // Il confronto deve avvenire sugli importi, non sulla percentuale a video.
    const r = calcolaCongruita({
      valoreOpera: 400_000,
      manodoperaDenunciata: 87_984,
      categoriaId: "ristrutturazione-civile",
      pubblico: false,
    });
    expect(r.incidenzaCalcolata).toBe(22.0); // ciò che l'utente vede
    expect(r.congruo).toBe(false); // ciò che è vero
    expect(r.scostamento).toBe(16);
  });

  it("applica la soglia dei 70.000 € solo ai lavori privati", () => {
    const base = {
      manodoperaDenunciata: 0,
      categoriaId: "og1-nuova-civile",
    };
    // Privato sotto soglia: fuori dalla verifica.
    expect(
      calcolaCongruita({ ...base, valoreOpera: SOGLIA_PRIVATI_EUR - 1, pubblico: false })
        .soggettoAVerifica,
    ).toBe(false);
    // Privato esattamente a 70.000: dentro ("pari o superiore").
    expect(
      calcolaCongruita({ ...base, valoreOpera: SOGLIA_PRIVATI_EUR, pubblico: false })
        .soggettoAVerifica,
    ).toBe(true);
    // Pubblico di qualunque importo: sempre dentro.
    expect(
      calcolaCongruita({ ...base, valoreOpera: 5_000, pubblico: true }).soggettoAVerifica,
    ).toBe(true);
  });

  it("non produce NaN né 'congruo' con input a zero, negativi o categoria ignota", () => {
    const zero = calcolaCongruita({
      valoreOpera: 0,
      manodoperaDenunciata: 0,
      categoriaId: "og1-nuova-civile",
      pubblico: true,
    });
    expect(zero.incidenzaCalcolata).toBe(0);
    expect(zero.congruo).toBe(false);

    const negativo = calcolaCongruita({
      valoreOpera: -100_000,
      manodoperaDenunciata: -5_000,
      categoriaId: "og1-nuova-civile",
      pubblico: true,
    });
    expect(Number.isFinite(negativo.incidenzaCalcolata)).toBe(true);
    expect(negativo.congruo).toBe(false);

    const ignota = calcolaCongruita({
      valoreOpera: 100_000,
      manodoperaDenunciata: 50_000,
      categoriaId: "categoria-inesistente",
      pubblico: true,
    });
    expect(ignota.categoria).toBeUndefined();
    expect(ignota.incidenzaRichiesta).toBe(0);
  });
});

/* ────────────────────────────── COSTO ORARIO ───────────────────────────── */

describe("costo orario reale", () => {
  const base = {
    retribuzioneLordaAnnua: 30_000,
    percentualeContributi: 30,
    percentualeCassaEdile: 10,
    percentualeTFR: 7,
    altriCostiAnnui: 1_200,
    oreContrattualiAnnue: 2_080,
    oreNonProduttiveAnnue: 320,
  };

  it("somma gli oneri e divide per le ore PRODUTTIVE, non per le contrattuali", () => {
    const r = calcolaCostoOrario(base);
    // 30.000 × (30+10+7)% = 14.100, + 1.200 di altri costi = 15.300
    expect(r.oneriTotali).toBe(15_300);
    expect(r.costoAnnuoTotale).toBe(45_300);
    expect(r.oreProduttive).toBe(1_760);
    // 45.300 / 1.760 = 25,74 €/h
    expect(r.costoOrarioReale).toBe(25.74);
    // Il numero sbagliato di uso comune: 30.000 / 2.080 = 14,42 €/h
    expect(r.costoOrarioApparente).toBe(14.42);
    expect(r.invalido).toBe(false);
  });

  it("quantifica lo scostamento fra costo reale e paga oraria", () => {
    const r = calcolaCostoOrario(base);
    // (25,74 − 14,42) / 14,42 ≈ +78,5%
    expect(r.scostamentoPercentuale).toBeGreaterThan(70);
    expect(r.scostamentoPercentuale).toBeLessThan(90);
  });

  it("segnala invalido invece di restituire Infinity quando non restano ore", () => {
    const r = calcolaCostoOrario({ ...base, oreNonProduttiveAnnue: 2_080 });
    expect(r.invalido).toBe(true);
    expect(r.costoOrarioReale).toBe(0);
    expect(Number.isFinite(r.costoOrarioReale)).toBe(true);
  });

  it("è invalido, non NaN, con retribuzione a zero", () => {
    const r = calcolaCostoOrario({ ...base, retribuzioneLordaAnnua: 0 });
    expect(r.invalido).toBe(true);
    expect(Number.isNaN(r.costoOrarioReale)).toBe(false);
  });
});

/* ─────────────────────────── RITENUTA DI GARANZIA ──────────────────────── */

describe("ritenuta di garanzia", () => {
  it("applica lo 0,50% di legge su ogni SAL", () => {
    const r = calcolaRitenuta({
      importoLavori: 500_000,
      percentualeRitenuta: 0.5,
      numeroSal: 5,
      mesiSvincolo: 12,
    });
    expect(r.importoPerSal).toBe(100_000);
    expect(r.trattenutaPerSal).toBe(500);
    expect(r.trattenutaTotale).toBe(2_500);
    expect(r.nettoPerSal).toBe(99_500);
    expect(r.nettoTotale).toBe(497_500);
  });

  it("la somma delle trattenute per SAL coincide con il totale", () => {
    const r = calcolaRitenuta({
      importoLavori: 333_333,
      percentualeRitenuta: 0.5,
      numeroSal: 3,
      mesiSvincolo: 6,
    });
    expect(r.trattenutaPerSal * 3).toBeCloseTo(r.trattenutaTotale, 1);
  });

  it("stima il costo dell'immobilizzo sui mesi di attesa", () => {
    const r = calcolaRitenuta(
      { importoLavori: 500_000, percentualeRitenuta: 0.5, numeroSal: 5, mesiSvincolo: 12 },
      6,
    );
    // 2.500 × 6% × 12/12 = 150
    expect(r.costoImmobilizzo).toBe(150);
    const meta = calcolaRitenuta(
      { importoLavori: 500_000, percentualeRitenuta: 0.5, numeroSal: 5, mesiSvincolo: 6 },
      6,
    );
    expect(meta.costoImmobilizzo).toBe(75);
  });

  it("tratta numeroSal a 0 come 1 invece di dividere per zero", () => {
    const r = calcolaRitenuta({
      importoLavori: 100_000,
      percentualeRitenuta: 0.5,
      numeroSal: 0,
      mesiSvincolo: 12,
    });
    expect(Number.isFinite(r.importoPerSal)).toBe(true);
    expect(r.importoPerSal).toBe(100_000);
  });
});
