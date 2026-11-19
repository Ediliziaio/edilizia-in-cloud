import { jsPDF } from "jspdf";
import { testoComprende, type RigaElencoLavori } from "./contrattoSubappaltoHtml";

export function richiestaOffertaPdf({
  commessa, ditta, righe,
}: {
  commessa?: string | null;
  ditta: string;
  righe: Array<Pick<RigaElencoLavori, "fase" | "sottofase" | "descrizione" | "quantita" | "unita" | "comprende">>;
}) {
  const pdf = new jsPDF();
  const margine = 15;
  const fine = 195;
  const colonne = [margine, 113, 135, 165, fine];
  const quantita = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 });
  let y = 0;

  function pagina() {
    pdf.setFont("helvetica", "bold").setFontSize(18).setTextColor(27, 51, 83);
    pdf.text("Richiesta d’offerta", margine, 20);
    pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(42, 53, 70);
    const riferimento = pdf.splitTextToSize([ditta, commessa && `Commessa ${commessa}`].filter(Boolean).join(" · "), fine - margine);
    pdf.text(riferimento, margine, 28);
    y = 33 + 4 * riferimento.length;
    pdf.text("Indicare i prezzi al netto dell’IVA e la validità dell’offerta.", margine, y);
    y += 5;
    pdf.setFillColor(232, 239, 248).rect(margine, y, fine - margine, 8, "F");
    pdf.setFont("helvetica", "bold").setFontSize(9);
    ["Lavorazione", "Quantità", "Prezzo unitario", "Importo"].forEach((testo, i) => pdf.text(testo, colonne[i] + 2, y + 5));
    y += 8;
  }

  const fasi = new Map<string, typeof righe>();
  for (const riga of righe) {
    const voci = fasi.get(riga.fase);
    if (voci) voci.push(riga);
    else fasi.set(riga.fase, [riga]);
  }
  pagina();
  for (const [fase, voci] of fasi) {
    let primaVoce = true;
    pdf.setFont("helvetica", "bold").setFontSize(9);
    const titolo = pdf.splitTextToSize(fase, fine - margine - 4);
    const altezzaTitolo = Math.max(7, 4 + 4 * titolo.length);
    for (const voce of voci) {
      const descrizione = pdf.setFont("helvetica", "normal").setFontSize(9).splitTextToSize(
        [voce.sottofase, voce.descrizione, testoComprende(voce.comprende)].filter(Boolean).join("\n"), colonne[1] - margine - 5,
      );
      const misura = pdf.splitTextToSize(`${quantita.format(voce.quantita)} ${voce.unita ?? ""}`.trim(), colonne[2] - colonne[1] - 4);
      const altezza = Math.max(10, 4 + 4 * Math.max(descrizione.length, misura.length));
      if (y + altezza + (primaVoce ? altezzaTitolo : 0) > 275) {
        pdf.addPage();
        pagina();
        primaVoce = true;
      }
      if (primaVoce) {
        pdf.setFillColor(244, 247, 250).rect(margine, y, fine - margine, altezzaTitolo, "F");
        pdf.setFont("helvetica", "bold").setFontSize(9).text(titolo, margine + 2, y + 5);
        y += altezzaTitolo;
        primaVoce = false;
      }
      pdf.setFont("helvetica", "normal").setFontSize(9);
      pdf.text(descrizione, margine + 2, y + 5);
      pdf.text(misura, colonne[1] + 2, y + 5);
      pdf.setDrawColor(201, 211, 223);
      for (const x of colonne) pdf.line(x, y, x, y + altezza);
      y += altezza;
      pdf.line(margine, y, fine, y);
    }
  }
  if (y + 23 > 275) {
    pdf.addPage();
    y = 20;
  }
  pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(27, 51, 83);
  pdf.text("Totale offerto, IVA esclusa", margine, y + 11);
  pdf.text("Offerta valida fino al", 113, y + 11);
  pdf.setDrawColor(145, 161, 182).line(63, y + 12, 99, y + 12).line(147, y + 12, fine, y + 12);
  for (let paginaCorrente = 1; paginaCorrente <= pdf.getNumberOfPages(); paginaCorrente++) {
    pdf.setPage(paginaCorrente).setFontSize(8).setTextColor(83, 100, 122);
    pdf.text(`${paginaCorrente} / ${pdf.getNumberOfPages()}`, fine, 287, { align: "right" });
  }
  return pdf;
}
