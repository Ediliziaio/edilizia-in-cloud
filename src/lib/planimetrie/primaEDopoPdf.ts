/**
 * PDF «Prima e dopo»: le due piante affiancate (com'è oggi, progetto) su un A3 orizzontale e,
 * nelle pagine dopo, i lavori stanza per stanza con i costi di massima e il totale.
 * Le immagini arrivano già fatte (PNG delle due piante sullo stesso riquadro).
 */
import { euro, nomeGenere, scriviQuantita, type RiepilogoLavori } from "./primaEDopo";

export interface DatiPdfPrimaEDopo {
  titolo: string;
  sottotitolo?: string;
  azienda?: string;
  prima: Uint8Array;
  dopo: Uint8Array;
  nomeProgetto?: string;
  lavori: RiepilogoLavori;
}

const MM = 72 / 25.4;

export async function pdfPrimaEDopo(d: DatiPdfPrimaEDopo): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.titolo} — prima e dopo`);
  doc.setCreator("Edilizia in Cloud — Planimetrie");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(StandardFonts.HelveticaBold);
  // pdf-lib con i font standard scrive solo WinAnsi: niente caratteri fuori (frecce, ≈…)
  const pulito = (s: string) => s.replace(/[^ -ÿ€’‘“”–—]/g, "");
  const W = 420 * MM, H = 297 * MM, M = 14 * MM;
  const grigio = rgb(0.35, 0.35, 0.38), scuro = rgb(0.1, 0.1, 0.12), riga = rgb(0.85, 0.85, 0.87);

  // ─── pagina 1: le due piante ───
  const p = doc.addPage([W, H]);
  p.drawText(pulito(d.titolo), { x: M, y: H - M - 16, size: 18, font: grassetto, color: scuro });
  p.drawText(pulito(d.sottotitolo ?? "Com'è oggi e come sarà"), { x: M, y: H - M - 34, size: 11, font, color: grigio });
  if (d.azienda) p.drawText(pulito(d.azienda), { x: W - M - font.widthOfTextAtSize(pulito(d.azienda), 10), y: H - M - 16, size: 10, font, color: grigio });
  const top = H - M - 56, basso = M + 40;
  const larg = (W - 2 * M - 10 * MM) / 2, alt = top - basso;
  for (const [i, png, etichetta] of [[0, d.prima, "COM'È OGGI"], [1, d.dopo, (d.nomeProgetto ?? "PROGETTO").toUpperCase()]] as const) {
    const img = await doc.embedPng(png);
    const s = Math.min(larg / img.width, (alt - 20) / img.height);
    const w = img.width * s, h = img.height * s;
    const x = M + i * (larg + 10 * MM);
    p.drawText(pulito(etichetta), { x, y: top - 12, size: 11, font: grassetto, color: i === 0 ? grigio : rgb(0.75, 0.1, 0.1) });
    p.drawImage(img, { x: x + (larg - w) / 2, y: top - 20 - h, width: w, height: h });
  }
  p.drawText(pulito("Nel progetto: in giallo ciò che si demolisce, in rosso ciò che si costruisce. Costi di massima, IVA esclusa: i prezzi definitivi sono nel preventivo."), { x: M, y: M + 14, size: 9, font, color: grigio });
  p.drawText(pulito(`Totale lavori di massima: ${euro(d.lavori.totale)}`), { x: W - M - grassetto.widthOfTextAtSize(pulito(`Totale lavori di massima: ${euro(d.lavori.totale)}`), 12), y: M + 12, size: 12, font: grassetto, color: scuro });

  // ─── pagine dopo: i lavori per stanza ───
  let pag = doc.addPage([W, H]);
  let y = H - M - 16;
  const colonne = { descr: M, genere: M + 250 * MM, qta: M + 300 * MM, prezzo: M + 335 * MM, importo: W - M };
  const intestazione = () => {
    pag.drawText(pulito(`${d.titolo} — lavori stanza per stanza`), { x: M, y, size: 14, font: grassetto, color: scuro });
    y -= 22;
    for (const [t, x, destra] of [["Lavoro", colonne.descr, false], ["Tipo", colonne.genere, false], ["Quantità", colonne.qta, false], ["Prezzo", colonne.prezzo, false], ["Importo", colonne.importo, true]] as const) {
      pag.drawText(t, { x: destra ? x - font.widthOfTextAtSize(t, 9) : x, y, size: 9, font: grassetto, color: grigio });
    }
    y -= 6;
    pag.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: riga });
    y -= 14;
  };
  const nuovaPagina = () => { pag = doc.addPage([W, H]); y = H - M - 16; intestazione(); };
  intestazione();
  const taglia = (s: string, max: number, f = font, size = 9) => {
    let t = pulito(s);
    while (t.length > 3 && f.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2);
    return t === pulito(s) ? t : `${t.trimEnd()}…`.replace("…", "...");
  };
  for (const s of d.lavori.stanze) {
    if (y < M + 60) nuovaPagina();
    pag.drawText(taglia(s.stanza, 240 * MM, grassetto, 11), { x: M, y, size: 11, font: grassetto, color: scuro });
    const tot = euro(s.totale);
    pag.drawText(pulito(tot), { x: colonne.importo - grassetto.widthOfTextAtSize(pulito(tot), 11), y, size: 11, font: grassetto, color: scuro });
    y -= 15;
    for (const l of s.lavori) {
      if (y < M + 30) nuovaPagina();
      pag.drawText(taglia(l.descrizione, 245 * MM), { x: colonne.descr + 8, y, size: 9, font, color: scuro });
      pag.drawText(pulito(nomeGenere(l.genere)), { x: colonne.genere, y, size: 9, font, color: grigio });
      pag.drawText(pulito(scriviQuantita(l)), { x: colonne.qta, y, size: 9, font, color: scuro });
      pag.drawText(pulito(l.prezzo == null ? "-" : euro(l.prezzo)), { x: colonne.prezzo, y, size: 9, font, color: grigio });
      const imp = l.prezzo == null ? "a parte" : euro(l.importo);
      pag.drawText(pulito(imp), { x: colonne.importo - font.widthOfTextAtSize(pulito(imp), 9), y, size: 9, font, color: scuro });
      y -= 13;
    }
    y -= 4;
    pag.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.4, color: riga });
  }
  if (y < M + 40) nuovaPagina();
  const tot = `Totale di massima: ${euro(d.lavori.totale)} (IVA esclusa)`;
  pag.drawText(pulito(tot), { x: W - M - grassetto.widthOfTextAtSize(pulito(tot), 13), y: y - 10, size: 13, font: grassetto, color: scuro });
  return doc.save();
}
