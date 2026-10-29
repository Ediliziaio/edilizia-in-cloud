/**
 * La pagina «Cronoprogramma dei lavori» del preventivo con computo: un Gantt
 * in giorni lavorativi, a settimane, una barra per fase. La usano i due motori
 * (editoriale e «come PriMus»): si apre una pagina nuova, si disegna, e il piè
 * di pagina lo mette il motore. Restituisce l'altezza a cui il motore riprende.
 */
import type { jsPDF } from "jspdf";
import { dataBreve, dataDelGiorno, durataTotale, leggiData, normalizzaFasi, type Cronoprogramma } from "./cronoprogramma";

export function disegnaCronoprogramma(doc: jsPDF, crono: Cronoprogramma, stile: {
  margine: number; colore: string; tinta: string; inchiostro: string; grigio: string; filetto: string; titolo?: string;
}): number | null {
  const fasi = normalizzaFasi(crono.fasi);
  if (!fasi.length) return null;
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const m = stile.margine, destra = W - m, fondo = H - 60;
  const totale = durataTotale({ fasi });
  const settimane = Math.max(1, Math.ceil(totale / 5));
  const inizio = leggiData(crono.dataInizio);
  const colNome = 168, x0 = m + colNome + 8, largo = destra - x0;
  const passo = largo / (settimane * 5);
  const font = (size: number, bold = false, colore = stile.inchiostro) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(colore); };
  const riga = 22;

  let y = 0;
  const testata = (seguito: boolean) => {
    doc.addPage(); y = m + 6;
    font(15, true); doc.text(seguito ? "Cronoprogramma dei lavori (segue)" : "Cronoprogramma dei lavori", m, y); y += 15;
    font(8, false, stile.grigio);
    const durata = `${totale} giorni lavorativi${settimane > 1 ? `, circa ${settimane} settimane` : ""}`;
    const periodo = inizio ? ` · dal ${inizio.toLocaleDateString("it-IT")} al ${dataDelGiorno(inizio, totale).toLocaleDateString("it-IT")}` : "";
    doc.text(`${stile.titolo ? `${stile.titolo} · ` : ""}${durata}${periodo}`.slice(0, 160), m, y); y += 18;
    // Le settimane: una colonna ogni cinque giorni lavorativi, con la data del lunedì se c'è una data d'inizio.
    const ogni = Math.max(1, Math.ceil(settimane / 26));
    doc.setFillColor(stile.tinta); doc.rect(x0, y - 10, largo, 16, "F");
    font(6.5, true, stile.grigio); doc.text("FASE", m, y);
    for (let s = 0; s < settimane; s += ogni) {
      const x = x0 + s * 5 * passo;
      const etichetta = inizio ? dataBreve(dataDelGiorno(inizio, s * 5 + 1)) : `S${s + 1}`;
      doc.text(etichetta, x + 2, y);
    }
    y += 12;
  };
  testata(false);
  const griglia = (dalY: number, alY: number) => {
    doc.setDrawColor(stile.filetto); doc.setLineWidth(0.3);
    for (let s = 0; s <= settimane; s++) { const x = x0 + s * 5 * passo; doc.line(x, dalY, x, alY); }
  };
  let inizioGriglia = y;
  for (const f of fasi) {
    const righeNome = doc.splitTextToSize(f.nome, colNome).slice(0, 2) as string[];
    const alto = Math.max(riga, righeNome.length * 10 + (f.nota ? 9 : 0) + 6);
    if (y + alto > fondo) { griglia(inizioGriglia, y); testata(true); inizioGriglia = y; }
    font(8.5, true); righeNome.forEach((r, k) => doc.text(r, m, y + 9 + k * 10));
    if (f.nota) { font(6.5, false, stile.grigio); doc.text((doc.splitTextToSize(f.nota, colNome) as string[])[0], m, y + 9 + righeNome.length * 10); }
    const bx = x0 + (f.inizio - 1) * passo, bw = Math.max(passo, f.durata * passo);
    doc.setFillColor(stile.colore); doc.roundedRect(bx, y + 3, bw, 11, 2, 2, "F");
    font(6.5, true, bw > 34 ? "#FFFFFF" : stile.inchiostro);
    const etichetta = `${f.durata} gg`;
    if (bw > 34) doc.text(etichetta, bx + 4, y + 10.5); else doc.text(etichetta, bx + bw + 3, y + 10.5);
    if (inizio) { font(6, false, stile.grigio); doc.text(`${dataBreve(dataDelGiorno(inizio, f.inizio))} - ${dataBreve(dataDelGiorno(inizio, f.inizio + f.durata - 1))}`, bx, y + 21); }
    y += alto;
    doc.setDrawColor(stile.filetto); doc.setLineWidth(0.3); doc.line(m, y, destra, y);
  }
  griglia(inizioGriglia, y);
  y += 16;
  font(7.5, false, stile.grigio);
  const avvertenza = [crono.nota.trim(), "Giorni lavorativi dal lunedì al venerdì. Le date possono cambiare per meteo, forniture e varianti richieste in corso d'opera."].filter(Boolean).join(" ");
  for (const r of doc.splitTextToSize(avvertenza, destra - m) as string[]) { if (y > fondo) break; doc.text(r, m, y); y += 10; }
  /** Dove il motore può continuare a scrivere, sulla stessa pagina. */
  return y + 10;
}
