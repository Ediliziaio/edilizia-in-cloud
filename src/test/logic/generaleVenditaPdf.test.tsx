/**
 * Scheda vendita e listino letti dal PDF vero: renderer vero, offline, testo estratto con
 * pdfjs. È la carta che l'acquirente o l'agenzia hanno in mano, quindi la prova guarda quella.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ListinoPDF, SchedaVenditaPDF } from "@/components/orders/generali/vendita/VenditaPDF";
import type { UnitaGenerale } from "@/lib/orders/generali/unita";
import { componiListino, componiSchedaVendita, type AziendaVendita } from "@/lib/orders/generali/vendita";

vi.setConfig({ testTimeout: 120_000 });

async function leggi(doc: ReactElement) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(doc as any);
  expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pagine: string[] = [];
  let immagini = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    pagine.push((await pagina.getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " "));
    const ops = await pagina.getOperatorList();
    // 85 = paintImageXObject: quante immagini sono davvero disegnate.
    immagini += ops.fnArray.filter((f) => f === 85).length;
  }
  return { pagine: pagine.length, testo: pagine.join(" ").toLowerCase(), immagini };
}

// Un pixel JPEG vero: il PDF deve reggere le immagini ridotte che arrivano dal browser.
const PIXEL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

const azienda: AziendaVendita = { nome: "Edil Srl", indirizzo: "Via Po 1, 10100 Torino (TO)", telefono: "011 123456", email: "vendite@edil.it", partitaIva: "01234567890", logo: null };

const unita = (sigla: string, over: Partial<UnitaGenerale> = {}): UnitaGenerale => ({
  orderId: `o-${sigla}`, codice: `O-${sigla}`, nome: sigla, scheda: true, id: `u-${sigla}`, sigla, edificio: null, piano: "2", tipologia: "Attico",
  mq: 120, millesimi: 250, listino: 450000, trattato: null, rogito: null, provvigione: 13500, stato: "libera",
  dataPrenotazione: null, dataCompromesso: null, rogitoPrevisto: null, dataRogito: null, acquirenteId: null, acquirente: null,
  agenzia: "Casa Facile", note: null, origineId: null, divisaIl: null, movimenti: [], importoCommessa: 450000, costoDiretto: 210000, ...over,
});

describe("PDF della scheda vendita", () => {
  it("operazione, unità, piano, tipologia, m², prezzo scelto, planimetria, foto, capitolato e contatti", async () => {
    const d = componiSchedaVendita({
      azienda, operazione: "Residenza Via Roma", unita: unita("C5"), conPrezzo: true,
      planimetria: PIXEL, foto: [PIXEL, PIXEL, PIXEL], capitolato: "Pavimenti in gres porcellanato\nPompa di calore e fotovoltaico", data: "2026-11-05",
    });
    const { testo, immagini } = await leggi(<SchedaVenditaPDF d={d} />);
    for (const atteso of [
      "residenza via roma", "unità c5", "attico", "2° piano", "120 m²", "€ 450.000",
      "planimetria", "foto e render", "capitolato in breve", "pavimenti in gres porcellanato", "pompa di calore e fotovoltaico",
      "edil srl", "011 123456", "vendite@edil.it", "via po 1", "05/11/2026",
    ]) expect(testo).toContain(atteso);
    // Planimetria e tre foto: quattro immagini disegnate.
    expect(immagini).toBe(4);
    // Mai costi, provvigioni o agenzia.
    for (const vietato of ["210.000", "13.500", "casa facile", "margine", "costo"]) expect(testo).not.toContain(vietato);
  });

  it("senza prezzo, senza immagini e senza capitolato: solo i dati e i contatti", async () => {
    const d = componiSchedaVendita({
      azienda, operazione: "Residenza Via Roma", unita: unita("C5", { stato: "prenotata", acquirente: "Mario Rossi", trattato: 430000 }), conPrezzo: false,
      planimetria: null, foto: [], capitolato: "", data: "2026-11-05",
    });
    const { testo, immagini, pagine } = await leggi(<SchedaVenditaPDF d={d} />);
    expect(pagine).toBe(1);
    expect(immagini).toBe(0);
    expect(testo).toContain("prenotata");
    for (const vietato of ["€", "mario rossi", "430.000", "450.000", "planimetria", "capitolato in breve"]) expect(testo).not.toContain(vietato);
  });
});

describe("PDF del listino disponibilità", () => {
  const elenco = [
    unita("A1", { piano: "T", tipologia: "Bilocale", mq: 60, listino: 180000 }),
    unita("A2", { piano: "1", tipologia: "Trilocale", mq: 85, listino: 250000, stato: "prenotata", acquirente: "Luca Verdi", trattato: 242000 }),
    unita("A3", { piano: "1", tipologia: "Trilocale", mq: 88, listino: 260000, stato: "rogitata", acquirente: "Anna Bianchi", trattato: 255000, rogito: 255000 }),
  ];

  it("unità, m², prezzo delle libere e stato; nessun acquirente né importo incassato", async () => {
    const d = componiListino({ azienda, operazione: "Residenza Via Roma", unita: elenco, conPrezzi: true, data: "2026-11-05" });
    const { testo } = await leggi(<ListinoPDF d={d} />);
    for (const atteso of ["listino disponibilità", "residenza via roma", "aggiornato al 05/11/2026", "a1", "bilocale", "piano terra", "€ 180.000", "prenotata", "venduta", "libera", "edil srl"]) {
      expect(testo).toContain(atteso);
    }
    expect(testo).toMatch(/\b1 libera\b/);
    for (const vietato of ["luca verdi", "anna bianchi", "250.000", "260.000", "242.000", "255.000", "incassat"]) expect(testo).not.toContain(vietato);
  });

  it("senza prezzi: nessun euro sulla carta", async () => {
    const d = componiListino({ azienda, operazione: "Residenza Via Roma", unita: elenco, conPrezzi: false, data: "2026-11-05" });
    const { testo } = await leggi(<ListinoPDF d={d} />);
    expect(testo).not.toContain("€");
    expect(testo).not.toContain("prezzo");
    expect(testo).toContain("trilocale");
  });

  it("molte unità vanno su più pagine e ognuna ha il piede con i numeri", async () => {
    const tante = Array.from({ length: 60 }, (_, i) => unita(`U${i + 1}`, { piano: String(1 + (i % 6)) }));
    const d = componiListino({ azienda, operazione: "Residenza Via Roma", unita: tante, conPrezzi: true, data: "2026-11-05" });
    const { pagine, testo } = await leggi(<ListinoPDF d={d} />);
    expect(pagine).toBeGreaterThan(1);
    expect(testo).toContain(`pag. ${pagine} / ${pagine}`);
    expect(testo).toContain("u60");
  });
});
