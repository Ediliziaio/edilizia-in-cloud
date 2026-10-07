/**
 * Il preventivo Serramenti riempie il fondo dell'ultimo foglio di proposta,
 * allegato tecnico, dettagli economici e pagina finale con una foto: l'altezza
 * la prende react-pdf a pagine fatte, la stima decide solo se vale la pena.
 * Tarata sul preventivo di prova di Demo Azienda 2 (SF-260922-0003).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALTEZZA_UTILE, FOTO_IN_FONDO_MINIMA, altezzaDomanda, altezzaGrafico, altezzaRigaAllegato, domandeCompatte, impagina, pezziDettagli, pezziInvestimento, spazioInFondo,
  type DatiDettagli, type DatiInvestimento,
} from "@/components/serramenti/impaginaSerramento";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
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

  it("la pagina del prezzo è alta quanto quella vera: testata 119, riquadro 117, avviso 73, tappe 166, finanziamento 128", () => {
    const sottotitolo = "Il totale è calcolato sulla composizione dell'offerta, sugli sconti applicati e sull'IVA selezionata. Eventuali varianti future saranno indicate in una nuova revisione.";
    const base: DatiInvestimento = { sottotitolo, sconto: false, righeNotaIva: 1, rataENetto: false, urgenza: null, tappe: 0, finanziamento: false };
    const alto = (d: DatiInvestimento) => pezziInvestimento(d).map((x) => x.alto);
    // Misurati sul PDF del preventivo di prova (07/10/2026): dalla testata alla fine del riquadro 236.
    const [testa, riquadro] = alto(base);
    expect(Math.abs(testa - 119)).toBeLessThan(3);
    expect(Math.abs(riquadro - 117)).toBeLessThan(3);
    // Con lo sconto il riquadro cresce di 12, con la riga delle rate di 52, due righe di nota IVA di 10.
    expect(Math.abs(alto({ ...base, sconto: true })[1] - riquadro - 12)).toBeLessThan(2);
    expect(Math.abs(alto({ ...base, rataENetto: true })[1] - riquadro - 52)).toBeLessThan(2);
    expect(Math.abs(alto({ ...base, righeNotaIva: 2 })[1] - riquadro - 10)).toBeLessThan(2);
    // L'avviso della scadenza 73, le tappe in fila 166 (fino a quattro) o in elenco (67 + 46 a tappa), il finanziamento 128.
    expect(Math.abs(alto({ ...base, urgenza: { descrizione: null, scontoFirmaPresto: false } })[2] - 73)).toBeLessThan(2);
    expect(alto({ ...base, tappe: 2 })[2]).toBe(166);
    expect(alto({ ...base, tappe: 4 })[2]).toBe(166);
    expect(alto({ ...base, tappe: 6 })[2]).toBe(67 + 46 * 6);
    expect(alto({ ...base, tappe: 2, finanziamento: true })).toHaveLength(4);
    expect(alto({ ...base, tappe: 2, finanziamento: true })[3]).toBe(128);
  });

  it("la foto sotto il prezzo esce quando la pagina lascia posto (anche col solo riquadro, come Renova) e non quando è piena", () => {
    const sottotitolo = "Il totale è calcolato sulla composizione dell'offerta, sugli sconti applicati e sull'IVA selezionata. Eventuali varianti future saranno indicate in una nuova revisione.";
    const base: DatiInvestimento = { sottotitolo, sconto: false, righeNotaIva: 1, rataENetto: false, urgenza: null, tappe: 0, finanziamento: false };
    const libero = (d: DatiInvestimento) => spazioInFondo(pezziInvestimento(d), 1);
    // Il preventivo di Renova: titolo e riquadro con la riga delle rate, il resto del foglio bianco (58%).
    expect(libero({ ...base, rataENetto: true })).toBeGreaterThan(300);
    expect(libero(base)).toBeGreaterThan(FOTO_IN_FONDO_MINIMA);
    expect(libero({ ...base, tappe: 3 })).toBeGreaterThan(FOTO_IN_FONDO_MINIMA);
    // Tappe e finanziamento (corpo che arriva a 201 punti dal basso: 109 liberi) o sei tappe in elenco: niente foto.
    expect(libero({ ...base, tappe: 2, finanziamento: true })).toBeLessThan(FOTO_IN_FONDO_MINIMA);
    expect(libero({ ...base, tappe: 6 })).toBeLessThan(FOTO_IN_FONDO_MINIMA);
  });

  it("le domande si stringono solo quando così stanno in un foglio e col respiro normale sbordano (le otto del modello di prova: di una)", () => {
    const base = { titolo: "Le risposte\nprima della conferma.", intro: "I dubbi più comuni spiegati in modo semplice, prima di decidere." };
    const faq = (createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: "Impresa esempio" }, "finestre").faq_items ?? []) as Array<{ domanda: string; risposta: string }>;
    const voci = faq.map((f) => ({ domanda: f.domanda, risposta: f.risposta }));
    expect(voci).toHaveLength(8);
    // Misurato sul PDF: sette domande più il titolo arrivavano a 28 punti dal fondo, l'ottava (69) sbordava di 41.
    expect(domandeCompatte({ ...base, voci })).toBe(true);
    // Poche domande ci stanno comunque: niente da stringere.
    expect(domandeCompatte({ ...base, voci: voci.slice(0, 4) })).toBe(false);
    // Risposte lunghe non ci stanno nemmeno strette: restano come sono (due fogli veri).
    const lunghe = voci.map((v) => ({ ...v, risposta: `${v.risposta} ${v.risposta} ${v.risposta}` }));
    expect(domandeCompatte({ ...base, voci: lunghe })).toBe(false);
    // Una voce incompleta (modello con una domanda senza risposta) non ferma il PDF.
    expect(() => domandeCompatte({ ...base, voci: [...voci, { domanda: "Senza risposta?" } as unknown as (typeof voci)[number], undefined as unknown as (typeof voci)[number]] })).not.toThrow();
    // Stretta, una domanda è più bassa di 9 punti.
    expect(altezzaDomanda("1. A?", "B", false) - altezzaDomanda("1. A?", "B", true)).toBe(9);
  });

  it("SerramentoPDF: la foto in fondo esce a pagine fatte, fissa, e mai due volte la stessa", () => {
    const pdf = readFileSync("src/components/serramenti/SerramentoPDF.tsx", "utf8");
    // Nel primo giro di react-pdf (senza sottopagina) la foto non c'è: non sposta niente.
    expect(pdf).toMatch(/subPageNumber != null && subPageTotalPages != null && subPageNumber === subPageTotalPages && mostra\(subPageTotalPages\)/);
    expect(pdf).toMatch(/<View\s+fixed\s+style=\{\{ flexGrow: 1 \}\}/);
    for (const foto of ["fotoProposta", "fotoAllegato", "fotoDettagli", "fotoCta", "fotoInvestimento"]) expect(pdf).toContain(`<FotoInFondo src={${foto}}`);
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
