/**
 * Il cronoprogramma della commessa in PDF, da stampare (31/10/2026): A4
 * orizzontale, a sinistra numero, attività, inizio, fine e giorni, a destra il
 * Gantt con le stesse regole della pagina (verde fatta, blu in corso, bordo
 * grigio da fare, rosso il ritardo con «+N gg»). Le fasi sono una linea
 * sottile sopra le loro sottofasi. Si va a pagina nuova ripetendo la testata.
 */
import type { RigaTabella } from "./tabellaCronoprogramma";
import { aggiungiGiorni, giorniTra } from "./cronoprogramma";

const COLORI = {
  fatta: [16, 185, 129], fattaScuro: [5, 150, 105],
  in_corso: [37, 99, 235], in_corsoChiaro: [219, 234, 254],
  da_fare: [148, 163, 184],
  ritardo: [220, 38, 38], ritardoChiaro: [248, 113, 113],
  oggi: [249, 115, 22], testo: [15, 23, 42], grigio: [100, 116, 139], filetto: [226, 232, 240], fondo: [248, 250, 252],
} as const;

const data = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const breve = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export async function pdfCronoprogramma(o: {
  titolo: string;
  righe: ReadonlyArray<RigaTabella>;
  da: string;
  a: string;
  oggi: string;
  dettagli?: string;
}): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const m = 28;
  const col = { n: m, nome: m + 26, inizio: m + 226, fine: m + 274, gg: m + 322 };
  const x0 = m + 350, x1 = W - m, largo = x1 - x0;
  const giorniAsse = Math.max(1, giorniTra(o.da, o.a) + 1);
  const dx = largo / giorniAsse;
  const xDi = (d: string) => x0 + Math.max(0, Math.min(giorniAsse, giorniTra(o.da, d))) * dx;
  const colore = (c: readonly number[], tipo: "fill" | "draw" | "text" = "fill") =>
    tipo === "fill" ? doc.setFillColor(c[0], c[1], c[2]) : tipo === "draw" ? doc.setDrawColor(c[0], c[1], c[2]) : doc.setTextColor(c[0], c[1], c[2]);
  const font = (size: number, bold = false, c: readonly number[] = COLORI.testo) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); colore(c, "text"); };
  const testo = (t: string, x: number, y: number, max?: number) => doc.text(max ? (doc.splitTextToSize(t, max)[0] as string) : t, x, y);

  let y = 0;
  let pagina = 0;
  const testata = () => {
    if (pagina > 0) doc.addPage();
    pagina++;
    y = m + 4;
    font(15, true); testo(o.titolo, m, y + 8);
    font(8.5, false, COLORI.grigio);
    testo(`${o.dettagli ? `${o.dettagli} · ` : ""}Dal ${data(o.da)} al ${data(o.a)} · stampato il ${data(o.oggi)}`, m, y + 22, W - 2 * m - 330);
    // Legenda in alto a destra.
    let lx = W - m - 320;
    const voce = (c: readonly number[], etichetta: string, bordo = false) => {
      if (bordo) { colore(COLORI.da_fare, "draw"); doc.setLineWidth(0.8); doc.setFillColor(255, 255, 255); doc.roundedRect(lx, y + 2, 14, 7, 1.5, 1.5, "FD"); }
      else { colore(c); doc.roundedRect(lx, y + 2, 14, 7, 1.5, 1.5, "F"); }
      font(7.5, false, COLORI.grigio); testo(etichetta, lx + 18, y + 8); lx += 18 + doc.getTextWidth(etichetta) + 12;
    };
    voce(COLORI.fatta, "Fatta"); voce(COLORI.in_corso, "In corso"); voce(COLORI.da_fare, "Da fare", true); voce(COLORI.ritardo, "Ritardo");
    y += 38;
    // Testata delle colonne e della scala.
    colore(COLORI.fondo); doc.rect(m, y, W - 2 * m, 18, "F");
    font(7, true, COLORI.grigio);
    testo("N.", col.n + 2, y + 12); testo("ATTIVITÀ", col.nome, y + 12); testo("INIZIO", col.inizio, y + 12); testo("FINE", col.fine, y + 12); testo("GG", col.gg, y + 12);
    const perMese = giorniAsse > 150;
    for (let i = 0; i < giorniAsse; i++) {
      const d = aggiungiGiorni(o.da, i);
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      const tacca = perMese ? d.endsWith("-01") : dow === 1;
      if (tacca) testo(perMese ? `${MESI[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}` : breve(d), x0 + i * dx + 1.5, y + 12);
    }
    y += 18;
  };

  const sfondoGantt = (yTop: number, h: number) => {
    // Fine settimana in grigio chiaro e tacche verticali, solo se i giorni si vedono.
    for (let i = 0; i < giorniAsse; i++) {
      const d = aggiungiGiorni(o.da, i);
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (dx >= 2 && (dow === 0 || dow === 6)) { colore(COLORI.fondo); doc.rect(x0 + i * dx, yTop, dx, h, "F"); }
      if ((giorniAsse > 150 ? d.endsWith("-01") : dow === 1)) { colore(COLORI.filetto, "draw"); doc.setLineWidth(0.4); doc.line(x0 + i * dx, yTop, x0 + i * dx, yTop + h); }
    }
    if (o.oggi >= o.da && o.oggi <= o.a) { colore(COLORI.oggi, "draw"); doc.setLineWidth(0.8); const xo = xDi(o.oggi) + dx / 2; doc.line(xo, yTop, xo, yTop + h); }
  };

  testata();
  const fondoPagina = H - m - 14;
  o.righe.forEach((r, k) => {
    const fase = r.livello === 0;
    const h = fase ? 20 : 15;
    if (y + h > fondoPagina) testata();
    if (fase) { colore(COLORI.fondo); doc.rect(m, y, x0 - m, h, "F"); }
    sfondoGantt(y, h);
    colore(COLORI.filetto, "draw"); doc.setLineWidth(0.4); doc.line(m, y + h, W - m, y + h);
    const base = y + (fase ? 13 : 10.5);
    font(fase ? 8.5 : 7.5, fase, fase ? COLORI.testo : COLORI.grigio); testo(r.numero, col.n + 2, base);
    font(fase ? 8.5 : 7.5, fase, COLORI.testo); testo(r.nome, fase ? col.nome : col.nome + 8, base, col.inizio - col.nome - (fase ? 6 : 14));
    font(7.5, false, COLORI.grigio); testo(data(r.inizio), col.inizio, base); testo(data(r.fine), col.fine, base); testo(r.giorni != null ? String(r.giorni) : "", col.gg, base);

    // La barra: per la fase con le sottofasi una linea sottile con le punte; sennò una barra piena.
    const haFigli = fase && o.righe[k + 1]?.livello === 1;
    if (r.inizio && r.fine) {
      const xa = xDi(r.inizio), xb = xDi(r.fine) + dx;
      const c = r.stato === "fatta" ? COLORI.fatta : r.stato === "in_corso" ? COLORI.in_corso : COLORI.da_fare;
      if (haFigli) {
        colore(r.stato === "fatta" ? COLORI.fattaScuro : c); doc.rect(xa, y + 7, xb - xa, 2.2, "F");
        doc.rect(xa, y + 7, 1.6, 6, "F"); doc.rect(xb - 1.6, y + 7, 1.6, 6, "F");
      } else {
        const by = y + (fase ? 5 : 3.5), bh = fase ? 10 : 8;
        if (r.stato === "da_fare") { colore(COLORI.da_fare, "draw"); doc.setLineWidth(0.8); doc.setFillColor(255, 255, 255); doc.roundedRect(xa, by, Math.max(2, xb - xa), bh, 1.5, 1.5, "FD"); }
        else if (r.stato === "in_corso") {
          colore(COLORI.in_corsoChiaro); doc.roundedRect(xa, by, Math.max(2, xb - xa), bh, 1.5, 1.5, "F");
          colore(COLORI.in_corso); doc.roundedRect(xa, by, Math.max(2, (xb - xa) * Math.min(1, r.avanzamento / 100)), bh, 1.5, 1.5, "F");
        } else { colore(c); doc.roundedRect(xa, by, Math.max(2, xb - xa), bh, 1.5, 1.5, "F"); }
      }
      if (r.ritardo > 0) {
        const xr = Math.min(x1, xb + r.ritardo * dx);
        colore(r.stato === "fatta" ? COLORI.ritardoChiaro : COLORI.ritardo);
        if (haFigli) doc.rect(xb, y + 7, xr - xb, 2.2, "F"); else doc.rect(xb, y + (fase ? 5 : 3.5), xr - xb, fase ? 10 : 8, "F");
        if (fase) { font(7.5, true, COLORI.ritardo); testo(`+${r.ritardo} gg`, Math.min(x1 - 30, xr + 3), base); }
      }
    }
    y += h;
  });

  // Piè di pagina: numero di pagina su tutte.
  const totale = doc.getNumberOfPages();
  for (let p = 1; p <= totale; p++) {
    doc.setPage(p);
    font(7, false, COLORI.grigio);
    testo(`${o.titolo} · pagina ${p} di ${totale}`, m, H - m + 6);
  }
  return doc.output("blob");
}
