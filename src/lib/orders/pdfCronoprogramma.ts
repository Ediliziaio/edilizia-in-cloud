/**
 * Il cronoprogramma della commessa in PDF, da stampare (31/10/2026). Due modi:
 *   · «previsionale» (quello che si dà al cliente prima dei lavori): solo il
 *     piano, un colore per fase e lo stesso, più chiaro, per le sue sottofasi;
 *     niente stati, ritardi né «oggi».
 *   · «avanzamento»: lo stato dei lavori, come la pagina.
 * E due versioni: con o senza chi lavora (responsabile, capocantiere, chi è in
 * ogni fase, ditte esterne).
 *
 * Si stampa anche in bianco e nero: ogni barra ha un bordo scuro, i toni sono
 * pieni, e ciò che è ancora da fare è tratteggiato; i ritardi hanno sempre il
 * loro «+N gg» scritto. A4 orizzontale, testata ripetuta a ogni pagina.
 */
import type { RigaTabella } from "./tabellaCronoprogramma";
import { aggiungiGiorni, giorniTra } from "./cronoprogramma";
import type { AziendaStampa, PersoneStampa } from "./datiStampaCronoprogramma";

type Rgb = readonly [number, number, number];
const C = {
  fatta: [16, 163, 106] as Rgb, in_corso: [29, 78, 216] as Rgb, in_corsoChiaro: [191, 219, 254] as Rgb,
  da_fareFondo: [226, 232, 240] as Rgb, bordo: [51, 65, 85] as Rgb,
  ritardo: [220, 38, 38] as Rgb, oggi: [234, 88, 12] as Rgb,
  testo: [15, 23, 42] as Rgb, grigio: [71, 85, 105] as Rgb, filetto: [203, 213, 225] as Rgb, fondo: [241, 245, 249] as Rgb, fs: [248, 250, 252] as Rgb,
} as const;
/** Un colore per fase nel previsionale, tutti scuri abbastanza da restare distinti in grigio. */
const TINTE_FASI: ReadonlyArray<Rgb> = [
  [29, 78, 216], [15, 118, 110], [180, 83, 9], [109, 40, 217], [190, 24, 93], [21, 128, 61], [14, 116, 144], [159, 18, 57],
];
const schiarisci = (c: Rgb, q: number): Rgb => [0, 1, 2].map((i) => Math.round(c[i] + (255 - c[i]) * q)) as unknown as Rgb;

const data = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const breve = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export async function pdfCronoprogramma(o: {
  titolo: string;
  righe: ReadonlyArray<RigaTabella>;
  da: string;
  a: string;
  oggi: string;
  /** Cliente, indirizzo dei lavori. */
  dettagli?: string;
  /** La descrizione dei lavori. */
  descrizione?: string | null;
  modo?: "previsionale" | "avanzamento";
  azienda?: AziendaStampa | null;
  /** Con chi lavora: responsabile, capocantiere, chi in ogni fase, ditte. */
  persone?: PersoneStampa | null;
}): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const previsionale = o.modo === "previsionale";
  const persone = o.persone ?? null;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const m = 28;
  const colChi = persone ? 120 : 0;
  const col = { n: m + 6, nome: m + 30, inizio: m + 222, fine: m + 270, gg: m + 318, chi: m + 342 };
  const x0 = m + 342 + colChi + (persone ? 6 : 0), x1 = W - m, largo = x1 - x0;
  const giorniAsse = Math.max(1, giorniTra(o.da, o.a) + 1);
  const dx = largo / giorniAsse;
  const perMese = giorniAsse > 150;
  const xDi = (d: string) => x0 + Math.max(0, Math.min(giorniAsse, giorniTra(o.da, d))) * dx;
  const riempi = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const traccia = (c: Rgb, spessore = 0.6) => { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(spessore); };
  const font = (size: number, bold = false, c: Rgb = C.testo) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(c[0], c[1], c[2]); };
  const scrivi = (t: string, x: number, y: number, max?: number) => doc.text(max ? (doc.splitTextToSize(t, max)[0] as string) : t, x, y);
  const tratteggio = (x: number, y: number, w: number, h: number, c: Rgb) => {
    // Righe oblique dentro la barra: «da fare» si riconosce anche senza colori.
    traccia(c, 0.5);
    for (let k = -h; k < w; k += 3.5) {
      const xa = Math.max(x, x + k), xb = Math.min(x + w, x + k + h);
      if (xb <= xa) continue;
      doc.line(xa, y + h - (xa - (x + k)), xb, y + h - (xb - (x + k)));
    }
  };
  /** Il ritardo: rosso con righe bianche, che in bianco e nero resta diverso dalle barre piene. */
  const ritardo = (x: number, y: number, w: number, h: number) => {
    if (w <= 0) return;
    riempi(C.ritardo); doc.rect(x, y, w, h, "F");
    traccia([255, 255, 255], 0.9);
    for (let k = x + 1.5; k < x + w; k += 3) doc.line(k, y, Math.min(x + w, k + h * 0.6), y + h);
  };
  const barraPiena = (x: number, y: number, w: number, h: number, fondo: Rgb, bordo: Rgb) => {
    riempi(fondo); traccia(bordo, 0.8); doc.roundedRect(x, y, Math.max(2, w), h, 1.5, 1.5, "FD");
  };

  let y = 0;
  let pagina = 0;
  const testata = () => {
    if (pagina > 0) doc.addPage();
    pagina++;
    y = m;
    // Logo a sinistra (se c'è), titolo accanto; l'azienda e i suoi contatti a destra.
    let xt = m;
    if (o.azienda?.logo) {
      const alto = 34, largoLogo = Math.min(120, (o.azienda.logo.largo / o.azienda.logo.alto) * alto);
      try { doc.addImage(o.azienda.logo.dataUrl, "PNG", m, y, largoLogo, (largoLogo / o.azienda.logo.largo) * o.azienda.logo.alto); xt = m + largoLogo + 12; } catch { /* logo illeggibile: si va avanti */ }
    }
    font(15, true); scrivi(o.titolo, xt, y + 13);
    font(8.5, false, C.grigio);
    scrivi(`${o.dettagli ? `${o.dettagli} · ` : ""}${previsionale ? "Date previste · " : ""}dal ${data(o.da)} al ${data(o.a)} · stampato il ${data(o.oggi)}`, xt, y + 27, W - xt - m - 200);
    if (o.azienda?.nome) {
      font(9, true); doc.text(o.azienda.nome, W - m, y + 10, { align: "right" });
      if (o.azienda.contatti) { font(7.5, false, C.grigio); doc.text(doc.splitTextToSize(o.azienda.contatti, 200)[0] as string, W - m, y + 21, { align: "right" }); }
    }
    y += 42;
    if (pagina === 1) {
      if (o.descrizione?.trim()) {
        font(8, false, C.testo);
        const righeDesc = (doc.splitTextToSize(o.descrizione.trim(), W - 2 * m) as string[]).slice(0, 2);
        doc.text(righeDesc, m, y); y += righeDesc.length * 10 + 2;
      }
      if (persone) {
        const voci = [
          persone.responsabile ? ["Responsabile", persone.responsabile] : null,
          persone.capocantiere ? ["Capocantiere", persone.capocantiere] : null,
          persone.ditte.length ? ["Imprese e subappaltatori", persone.ditte.join(", ")] : null,
        ].filter(Boolean) as string[][];
        if (voci.length) {
          riempi(C.fondo); doc.rect(m, y, W - 2 * m, 16, "F");
          let xv = m + 6;
          for (const [etichetta, valore] of voci) {
            font(7.5, true, C.grigio); doc.text(`${etichetta}:`, xv, y + 11); xv += doc.getTextWidth(`${etichetta}:`) + 3;
            font(7.5, false, C.testo); const v = doc.splitTextToSize(valore, 260)[0] as string; doc.text(v, xv, y + 11); xv += doc.getTextWidth(v) + 16;
          }
          y += 22;
        }
      }
    }
    // Legenda.
    let lx = m;
    const voce = (disegna: (x: number, yy: number) => void, etichetta: string) => {
      disegna(lx, y + 1); font(7.5, false, C.grigio); scrivi(etichetta, lx + 18, y + 7.5); lx += 18 + doc.getTextWidth(etichetta) + 14;
    };
    if (previsionale) {
      voce((x, yy) => { riempi(TINTE_FASI[0]); doc.rect(x, yy + 2, 14, 2.2, "F"); doc.rect(x, yy + 2, 1.6, 5, "F"); doc.rect(x + 12.4, yy + 2, 1.6, 5, "F"); }, "Fase");
      voce((x, yy) => barraPiena(x, yy, 14, 7, schiarisci(TINTE_FASI[0], 0.55), TINTE_FASI[0]), "Sottofase (stesso colore della fase)");
    } else {
      voce((x, yy) => barraPiena(x, yy, 14, 7, C.fatta, C.fatta), "Fatta");
      voce((x, yy) => { barraPiena(x, yy, 14, 7, C.in_corsoChiaro, C.in_corso); riempi(C.in_corso); doc.rect(x, yy, 7, 7, "F"); }, "In corso (pieno = avanzamento)");
      voce((x, yy) => { barraPiena(x, yy, 14, 7, C.da_fareFondo, C.bordo); tratteggio(x, yy, 14, 7, C.bordo); }, "Da fare");
      voce((x, yy) => ritardo(x, yy, 14, 7), "Ritardo (+N gg)");
      voce((x, yy) => { traccia(C.oggi, 1); doc.line(x + 7, yy - 1, x + 7, yy + 8); }, "Oggi");
    }
    y += 14;
    // Testata delle colonne e della scala.
    riempi(C.fondo); doc.rect(m, y, W - 2 * m, 18, "F");
    font(7, true, C.grigio);
    scrivi("N.", col.n, y + 12); scrivi("ATTIVITÀ", col.nome, y + 12); scrivi("INIZIO", col.inizio, y + 12); scrivi("FINE", col.fine, y + 12); scrivi("GG", col.gg, y + 12);
    if (persone) scrivi("CHI LAVORA", col.chi, y + 12);
    for (let i = 0; i < giorniAsse; i++) {
      const d = aggiungiGiorni(o.da, i);
      const tacca = perMese ? d.endsWith("-01") : new Date(`${d}T12:00:00Z`).getUTCDay() === 1;
      if (tacca) scrivi(perMese ? `${MESI[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}` : breve(d), x0 + i * dx + 1.5, y + 12);
    }
    y += 18;
  };

  const sfondoGantt = (yTop: number, h: number) => {
    for (let i = 0; i < giorniAsse; i++) {
      const d = aggiungiGiorni(o.da, i);
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (dx >= 2 && (dow === 0 || dow === 6)) { riempi(C.fs); doc.rect(x0 + i * dx, yTop, dx, h, "F"); }
      if (perMese ? d.endsWith("-01") : dow === 1) { traccia(C.filetto, 0.4); doc.line(x0 + i * dx, yTop, x0 + i * dx, yTop + h); }
    }
    if (!previsionale && o.oggi >= o.da && o.oggi <= o.a) { traccia(C.oggi, 0.9); const xo = xDi(o.oggi) + dx / 2; doc.line(xo, yTop, xo, yTop + h); }
  };

  testata();
  const fondoPagina = H - m - 14;
  let faseCorrente = -1;
  o.righe.forEach((r, k) => {
    const fase = r.livello === 0;
    if (fase) faseCorrente++;
    const tinta = TINTE_FASI[Math.max(0, faseCorrente) % TINTE_FASI.length];
    const h = fase ? 20 : 15;
    if (y + h > fondoPagina) testata();
    if (fase) { riempi(C.fondo); doc.rect(m, y, x0 - m, h, "F"); }
    if (previsionale) { riempi(fase ? tinta : schiarisci(tinta, 0.45)); doc.rect(m, y + 2, 2.5, h - 4, "F"); }
    sfondoGantt(y, h);
    traccia(C.filetto, 0.4); doc.line(m, y + h, W - m, y + h);
    const base = y + (fase ? 13 : 10.5);
    font(fase ? 8.5 : 7.5, fase, fase ? C.testo : C.grigio); scrivi(r.numero, col.n, base);
    font(fase ? 8.5 : 7.5, fase, C.testo); scrivi(r.nome, fase ? col.nome : col.nome + 8, base, col.inizio - col.nome - (fase ? 6 : 14));
    font(7.5, false, C.grigio); scrivi(data(r.inizio), col.inizio, base); scrivi(data(r.fine), col.fine, base); scrivi(r.giorni != null ? String(r.giorni) : "", col.gg, base);
    if (persone && fase) { font(7, false, C.testo); scrivi((persone.perFase.get(r.id) ?? []).join(", "), col.chi, base, colChi - 6); }

    const haFigli = fase && o.righe[k + 1]?.livello === 1;
    if (!r.inizio || !r.fine) { y += h; return; }
    const xa = xDi(r.inizio), xb = xDi(r.fine) + dx;
    const by = y + (fase ? 5 : 3.5), bh = fase ? 10 : 8;
    // La fase con le sottofasi: una linea con le punte, nel colore delle barre sotto.
    const parentesi = (c: Rgb) => { riempi(c); doc.rect(xa, y + 7, xb - xa, 2.4, "F"); doc.rect(xa, y + 7, 1.8, 6.5, "F"); doc.rect(xb - 1.8, y + 7, 1.8, 6.5, "F"); };
    if (previsionale) {
      if (haFigli) parentesi(tinta);
      else barraPiena(xa, by, xb - xa, bh, fase ? tinta : schiarisci(tinta, 0.55), tinta);
    } else {
      const c = r.stato === "fatta" ? C.fatta : r.stato === "in_corso" ? C.in_corso : C.bordo;
      if (haFigli) parentesi(c);
      else if (r.stato === "fatta") barraPiena(xa, by, xb - xa, bh, C.fatta, C.fatta);
      else if (r.stato === "in_corso") {
        barraPiena(xa, by, xb - xa, bh, C.in_corsoChiaro, C.in_corso);
        tratteggio(xa, by, xb - xa, bh, schiarisci(C.in_corso, 0.35));
        riempi(C.in_corso); doc.rect(xa, by, Math.max(1.5, (xb - xa) * Math.min(1, r.avanzamento / 100)), bh, "F");
      } else { barraPiena(xa, by, xb - xa, bh, C.da_fareFondo, C.bordo); tratteggio(xa, by, xb - xa, bh, C.bordo); }
      if (r.ritardo > 0) {
        const xr = Math.min(x1, xb + r.ritardo * dx);
        if (haFigli) { riempi(C.ritardo); doc.rect(xb, y + 7, xr - xb, 2.4, "F"); } else ritardo(xb, by, xr - xb, bh);
        if (fase) { font(7.5, true, C.ritardo); scrivi(`+${r.ritardo} gg`, Math.min(x1 - 30, xr + 3), base); }
      }
    }
    y += h;
  });

  const totale = doc.getNumberOfPages();
  for (let p = 1; p <= totale; p++) {
    doc.setPage(p);
    font(7, false, C.grigio);
    scrivi(`${o.titolo}${o.azienda?.nome ? ` · ${o.azienda.nome}` : ""}`, m, H - m + 6);
    doc.text(`pagina ${p} di ${totale}`, W - m, H - m + 6, { align: "right" });
  }
  return doc.output("blob");
}
