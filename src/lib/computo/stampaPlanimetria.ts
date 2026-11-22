import type { jsPDF } from "jspdf";

export interface PlanimetriaComputoPdf {
  versione: number;
  variante: string;
  numeroPiani: number;
  misureStimate?: boolean;
  tavole: {
    nome: string;
    dati: Uint8Array;
    larghezza: number;
    altezza: number;
    nuovo: boolean;
    demolito: boolean;
  }[];
}

export function disegnaPlanimetriaComputo(doc: jsPDF, pianta: PlanimetriaComputoPdf, x: number, y: number, larghezza: number, altezzaMassima: number) {
  const bordo = "#D9E2EA", secondario = "#45586B", testo = "#14283A";
  const margine = 12, interno = larghezza - 2 * margine, intervallo = 12;
  const { tavole } = pianta;
  const w = (interno - intervallo * Math.max(0, tavole.length - 1)) / Math.max(1, tavole.length);
  const altezzaDisegni = tavole.length ? Math.max(24, Math.min(
    altezzaMassima - 79,
    Math.max(95, ...tavole.map(p => (w - 8) * p.altezza / p.larghezza)),
  )) : 0;
  const altezza = tavole.length ? 79 + altezzaDisegni : 55;
  doc.setFillColor("#FFFFFF"); doc.setDrawColor(bordo); doc.setLineWidth(.5);
  doc.roundedRect(x, y, larghezza, altezza, 5, 5, "FD");
  const font = (size: number, grassetto = false) => {
    doc.setFont("helvetica", grassetto ? "bold" : "normal");
    doc.setFontSize(size); doc.setTextColor(grassetto ? testo : secondario);
  };
  const inRiga = (s: string, max: number) => {
    if (doc.getTextWidth(s) <= max) return s;
    return `${(doc.splitTextToSize(s, max - 10) as string[])[0].trimEnd()}…`;
  };
  const sinistra = x + margine;
  font(11, true); doc.text("Planimetria della variante", sinistra, y + 16);
  font(8); doc.text(inRiga(`${pianta.variante} · Versione ${pianta.versione}`, interno), sinistra, y + 29);
  if (!tavole.length) {
    doc.text("Tavola non disponibile per questa versione.", sinistra, y + 43);
    return altezza + 12;
  }
  tavole.forEach((piano, i) => {
    const dx = sinistra + i * (w + intervallo), dy = y + 48;
    font(8.5, true); doc.text(inRiga(piano.nome, w), dx, y + 43);
    doc.setDrawColor(bordo); doc.setLineWidth(.45); doc.roundedRect(dx, dy, w, altezzaDisegni, 3, 3);
    const k = Math.min((w - 6) / piano.larghezza, (altezzaDisegni - 6) / piano.altezza);
    const imgW = piano.larghezza * k, imgH = piano.altezza * k;
    doc.addImage(piano.dati, "PNG", dx + (w - imgW) / 2, dy + (altezzaDisegni - imgH) / 2, imgW, imgH, undefined, "FAST");
  });
  let lx = sinistra;
  const ly = y + altezzaDisegni + 60;
  const legenda = (etichetta: string, colore: string) => {
    doc.setFillColor(colore); doc.rect(lx, ly - 5, 6, 6, "F");
    font(7.5); doc.text(etichetta, lx + 9, ly + .5);
    lx += 20 + doc.getTextWidth(etichetta);
  };
  legenda("Esistente", "#3A3A3A");
  if (tavole.some(p => p.demolito)) legenda("Da demolire", "#FFD400");
  if (tavole.some(p => p.nuovo)) legenda("Nuovo", "#E30613");
  const altri = pianta.numeroPiani - tavole.length;
  const nota = ["Disegno adattato alla pagina", pianta.misureStimate && "Misure indicative",
    altri && `Altri ${altri} ${altri === 1 ? "piano" : "piani"} nella variante`].filter(Boolean).join(" · ");
  font(7); doc.text(inRiga(nota, interno), sinistra, ly + 11);
  return altezza + 12;
}
