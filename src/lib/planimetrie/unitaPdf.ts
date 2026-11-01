/**
 * Scheda PDF di un'unità (appartamento, negozio, box) per agenzie e cantieri in vendita: una
 * pagina A4 per piano con la pianta (solo le stanze dell'unità, le altre restano bianche) e in
 * fondo la tabella delle stanze, le superfici, i millesimi e il prezzo.
 */
import type { Unita } from "./unita";
import { NOMI_STATO_VENDITA } from "./unita";

export interface DatiSchedaUnita {
  titolo: string;
  azienda?: string;
  unita: Unita;
  /** Le piante, una per piano dell'unità, già in PNG. */
  piante: Array<{ piano: string; png: Uint8Array }>;
}

const MM = 72 / 25.4;
const mq = (v: number) => `${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
const euro = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export async function pdfSchedaUnita(d: DatiSchedaUnita): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.titolo} — ${d.unita.sigla}`);
  doc.setCreator("Edilizia in Cloud — Planimetrie");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pulito = (s: string) => s.replace(/[^ -ÿ€’‘“”–—²]/g, "");
  const W = 210 * MM, H = 297 * MM, M = 15 * MM;
  const scuro = rgb(0.1, 0.1, 0.12), grigio = rgb(0.4, 0.4, 0.43), riga = rgb(0.86, 0.86, 0.88);
  const u = d.unita;
  const testata = (p: ReturnType<typeof doc.addPage>, sotto: string) => {
    p.drawText(pulito(`${u.sigla}`), { x: M, y: H - M - 18, size: 20, font: bold, color: scuro });
    p.drawText(pulito(`${d.titolo} — ${sotto}`), { x: M, y: H - M - 34, size: 10, font, color: grigio });
    if (d.azienda) p.drawText(pulito(d.azienda), { x: W - M - font.widthOfTextAtSize(pulito(d.azienda), 9), y: H - M - 16, size: 9, font, color: grigio });
  };
  const piante = d.piante.length ? d.piante : [{ piano: u.piani.join(", "), png: null as unknown as Uint8Array }];
  for (const [i, pianta] of piante.entries()) {
    const p = doc.addPage([W, H]);
    testata(p, pianta.piano);
    const ultima = i === piante.length - 1;
    const basso = ultima ? M + 95 * MM : M;
    const alto = H - M - 50;
    if (pianta.png) {
      const img = await doc.embedPng(pianta.png);
      const s = Math.min((W - 2 * M) / img.width, (alto - basso) / img.height);
      p.drawImage(img, { x: (W - img.width * s) / 2, y: alto - img.height * s, width: img.width * s, height: img.height * s });
    }
    if (!ultima) continue;
    // tabella: stanze, superfici, millesimi, prezzo
    let y = M + 88 * MM;
    p.drawText("Stanze", { x: M, y, size: 11, font: bold, color: scuro });
    y -= 14;
    for (const l of u.locali.slice(0, 14)) {
      const destra = mq(l.mq) + (l.coefficiente !== 1 ? `  × ${String(l.coefficiente).replace(".", ",")}` : "");
      p.drawText(pulito(`${l.nome}${u.piani.length > 1 ? ` (${l.livello})` : ""}`), { x: M, y, size: 9, font, color: scuro });
      p.drawText(pulito(destra), { x: M + 110 * MM - font.widthOfTextAtSize(pulito(destra), 9), y, size: 9, font, color: grigio });
      y -= 12;
    }
    if (u.locali.length > 14) { p.drawText(pulito(`… e altre ${u.locali.length - 14}`), { x: M, y, size: 9, font, color: grigio }); y -= 12; }
    p.drawLine({ start: { x: M, y: y + 6 }, end: { x: M + 110 * MM, y: y + 6 }, thickness: 0.5, color: riga });
    const righe: Array<[string, string]> = [
      ["Superficie netta", mq(u.mqNetti)],
      ["Superficie commerciale", mq(u.mqCommerciali)],
      ["Millesimi di proprietà (proposta)", u.millesimi.toLocaleString("it-IT", { minimumFractionDigits: 2 })],
      ...(u.vendita.prezzoMq ? [["Prezzo al m²", euro(u.vendita.prezzoMq)] as [string, string]] : []),
      ...(u.prezzo ? [["Prezzo", euro(u.prezzo)] as [string, string]] : []),
      ["Stato", NOMI_STATO_VENDITA[u.vendita.stato ?? "libera"]],
    ];
    let y2 = M + 88 * MM;
    for (const [k, v] of righe) {
      p.drawText(pulito(k), { x: M + 120 * MM, y: y2, size: 9, font, color: grigio });
      p.drawText(pulito(v), { x: W - M - bold.widthOfTextAtSize(pulito(v), 10), y: y2, size: 10, font: bold, color: scuro });
      y2 -= 16;
    }
    if (u.vendita.note) p.drawText(pulito(u.vendita.note).slice(0, 90), { x: M + 120 * MM, y: y2 - 4, size: 8, font, color: grigio });
    p.drawText(pulito("Superfici nette misurate sulla pianta; commerciale con balconi e terrazzi al 30%, cantine al 25%, box al 50%. Millesimi indicativi."), { x: M, y: M - 4, size: 7, font, color: grigio });
  }
  return doc.save();
}
