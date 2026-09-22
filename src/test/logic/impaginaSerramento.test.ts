/**
 * Il preventivo Serramenti riempie il fondo dell'ultimo foglio di proposta,
 * allegato tecnico, dettagli economici e pagina finale con una foto: l'altezza
 * la prende react-pdf a pagine fatte, la stima decide solo se vale la pena.
 * Tarata sul preventivo di prova di Demo Azienda 2 (SF-260922-0003).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALTEZZA_UTILE, FOTO_IN_FONDO_MINIMA, altezzaGrafico, altezzaRigaAllegato, impagina, pezziDettagli, spazioInFondo,
  type DatiDettagli,
} from "@/components/serramenti/impaginaSerramento";
import { proporzioniImmagine } from "@/lib/pdf/proporzioniImmagine";

describe("impaginazione delle sezioni Serramenti", () => {
  it("un pezzo che non sta va sul foglio dopo; un testo lungo si spezza fra le righe", () => {
    expect(impagina([{ alto: 300 }, { alto: 300 }], 639)).toEqual({ fogli: 1, coda: 600 });
    expect(impagina([{ alto: 300 }, { alto: 300 }, { alto: 100 }], 639)).toEqual({ fogli: 2, coda: 100 });
    // 10 righe da 16: sul primo foglio ne stanno 4 (639 − 570 = 69), le altre 6 passano.
    expect(impagina([{ alto: 570 }, { alto: 160, riga: 16 }], 639)).toEqual({ fogli: 2, coda: 96 });
    // La testata della tabella si ripete in cima al foglio nuovo.
    expect(impagina([{ alto: 600 }, { alto: 98, testataRipetuta: 21 }], 639)).toEqual({ fogli: 2, coda: 119 });
  });

  it("un titolo non resta da solo in fondo al foglio", () => {
    expect(impagina([{ alto: 590 }, { alto: 45, conSeguente: 30 }, { alto: 40 }], 639)).toEqual({ fogli: 2, coda: 85 });
  });

  it("la foto esce solo se sotto c'è posto, e solo se i fogli sono quelli stimati", () => {
    const pezzi = [{ alto: 400 }, { alto: 400 }];
    expect(spazioInFondo(pezzi, 2)).toBeGreaterThan(FOTO_IN_FONDO_MINIMA);
    // Vicino al bordo la stima si riallinea al numero vero di fogli.
    expect(spazioInFondo([{ alto: 400 }, { alto: 230 }], 2)).toBeGreaterThan(FOTO_IN_FONDO_MINIMA);
    expect(spazioInFondo([{ alto: 400 }, { alto: 230 }], 1)).toBeLessThan(FOTO_IN_FONDO_MINIMA);
    // Se i fogli veri non tornano con nessuna stima, niente foto.
    expect(spazioInFondo(pezzi, 5)).toBe(0);
  });

  it("una riga dell'allegato è alta quanto quella vera (97,8 punti nel preventivo di prova)", () => {
    const alta = altezzaRigaAllegato({
      macro: "SERRAMENTI STANDARD", titolo: "Finestra 2 Ante · Soggiorno",
      datiPrincipali: "1200 × 1450 mm · PVC · PVC 76 mm, 6 camere",
      fornitore: null, colori: "Colore interno: Bianco  ·  Colore esterno: Bianco",
      tecnica: "Vetrocamera basso-emissiva 4-16-4 con gas argon e canalina calda",
      descrizioneTecnica: "Finestra a due ante con anta-ribalta principale.",
      soloFornitura: false, schede: [], scelte: [], note: null,
    });
    expect(Math.abs(alta - 97.8)).toBeLessThan(6);
  });

  it("i dettagli economici del preventivo di prova stanno in un foglio col grafico un po' più basso", () => {
    const d: DatiDettagli = {
      titolo: "Valore, recuperi e inclusioni.",
      sottotitolo: "Un riepilogo ordinato per leggere con chiarezza la detrazione fiscale, il recupero negli anni, cosa è compreso e gli omaggi.",
      detrazione: { tabella: true },
      recupero: { didascalia: "Ogni anno € 180 di risparmio in bolletta e € 482 di detrazione: il saldo parte dalla spesa iniziale e risale anno dopo anno.", pareggio: false },
      rate: false,
      incluso: [
        { titolo: "Rilievo tecnico delle misure prima dell'ordine" },
        { titolo: "Smontaggio dei vecchi serramenti e smaltimento in discarica autorizzata" },
        { titolo: "Fornitura e posa dei nuovi serramenti, con sigillature e finiture interne" },
        { titolo: "Regolazione di ante, maniglie e ferramenta, e collaudo con te" },
        { titolo: "Documenti per la detrazione fiscale" },
      ],
      regali: [{ titolo: "Zanzariere in omaggio su tutte le finestre", valore: true }, { titolo: "Regolazione delle ante dopo il primo inverno", valore: true }],
      totaleRegali: true,
    };
    // Misurati sul PDF: intestazione 88, detrazione 171, recupero 228 (grafico 150), incluso e regali 166.
    const [testa, detrazione, recupero, inclusoRegali] = pezziDettagli(d, 150).map((p) => p.alto);
    expect(Math.abs(testa - 88)).toBeLessThan(6);
    expect(Math.abs(detrazione - 171)).toBeLessThan(6);
    expect(Math.abs(recupero - 228)).toBeLessThan(6);
    expect(Math.abs(inclusoRegali - 166)).toBeLessThan(10);
    const grafico = altezzaGrafico(d);
    expect(grafico).toBeLessThan(150);
    expect(grafico).toBeGreaterThanOrEqual(110);
    expect(impagina(pezziDettagli(d, grafico)).fogli).toBe(1);
    // Senza recupero il grafico non c'è e non si tocca nulla.
    expect(altezzaGrafico({ ...d, recupero: null })).toBe(150);
    expect(ALTEZZA_UTILE).toBeCloseTo(638.89, 1);
  });

  it("SerramentoPDF: la foto in fondo esce a pagine fatte, fissa, e mai due volte la stessa", () => {
    const pdf = readFileSync("src/components/serramenti/SerramentoPDF.tsx", "utf8");
    // Nel primo giro di react-pdf (senza sottopagina) la foto non c'è: non sposta niente.
    expect(pdf).toMatch(/subPageNumber != null && subPageTotalPages != null && subPageNumber === subPageTotalPages && mostra\(subPageTotalPages\)/);
    expect(pdf).toMatch(/<View\s+fixed\s+style=\{\{ flexGrow: 1 \}\}/);
    for (const foto of ["fotoProposta", "fotoAllegato", "fotoDettagli", "fotoCta"]) expect(pdf).toContain(`<FotoInFondo src={${foto}}`);
    expect(pdf).toContain("if (!src || fotoUsate.has(src)) return null;");
  });
});

describe("proporzioni delle foto già convertite", () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    b.set([(w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255], 16);
    return `data:image/png;base64,${Buffer.from(b).toString("base64")}`;
  };
  const jpg = (w: number, h: number) => {
    // SOI, un APP0 da 16 byte, poi SOF0 con altezza e larghezza.
    const b = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    return `data:image/jpeg;base64,${Buffer.from(b).toString("base64")}`;
  };

  it("legge larghezza e altezza di PNG e JPG", () => {
    expect(proporzioniImmagine(png(1600, 900))).toBeCloseTo(1.778, 3);
    expect(proporzioniImmagine(jpg(1080, 1350))).toBeCloseTo(0.8, 3);
  });

  it("un indirizzo che non è un data URL, o un file illeggibile, dà null", () => {
    expect(proporzioniImmagine("/pdf-stock/serramenti/rilievo.jpg")).toBeNull();
    expect(proporzioniImmagine("data:image/png;base64,AAAA")).toBeNull();
    expect(proporzioniImmagine(null)).toBeNull();
  });
});
