import { jsPDF } from "jspdf";
import { categorieCosto, centesimiCosto, costoCompletoVoce, euroAnalisi, quoteCostiComuni, soldi, type analizzaPreventivo, type AnalisiCosti } from "./analisiCosti";

import { formatoDataStima, stimaTempiAggiornata } from "./stimaTempistiche";

type Risultato = ReturnType<typeof analizzaPreventivo>;
const euro = (c: number | null) => c === null ? "—" : euroAnalisi.format(soldi(c));
const percentuale = (valore: number | null) => valore === null ? "—" : valore.toLocaleString("it-IT", { maximumFractionDigits: 2 }) + "%";
const blu = [25, 52, 82] as const;

export function pdfAnalisiCosti(
  dati: { titolo: string; numero: string; revisione: string; azienda?: string },
  analisi: Risultato, tempistiche?: AnalisiCosti["tempistiche"],
) {
  const doc = new jsPDF();
  const intestazione = [dati.numero, dati.revisione].filter(Boolean).join(" | ") || "Bozza";
  doc.setFillColor(...blu);
  doc.rect(0, 0, 210, 35, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Analisi costi", 14, 16);
  doc.setFontSize(9);
  doc.text("DOCUMENTO INTERNO  /  " + intestazione, 14, 26);
  doc.setTextColor(...blu);
  doc.setFontSize(13);
  const titolo = doc.splitTextToSize(dati.titolo, 182) as string[];
  doc.text(titolo, 14, 45);
  const pos = 48 + titolo.length * 5;
  if (dati.azienda) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(dati.azienda, 14, pos);
  }
  let cursore = pos + 6;
  function tabella(head: string[], body: string[][], larghezze: number[]) {
    function riga(valori: string[], linee: string[][], altezza: number, sfondo: readonly [number, number, number], header = false) {
      doc.setFillColor(...sfondo);
      doc.rect(14, cursore, 182, altezza, "F");
      if (header) doc.setTextColor(255);
      else doc.setTextColor(...blu);
      doc.setFont("helvetica", header ? "bold" : "normal");
      doc.setFontSize(8);
      let x = 14;
      valori.forEach((_, i) => {
        doc.text(linee[i], x + 2, cursore + 4, { lineHeightFactor: 1.25 });
        x += larghezze[i];
      });
      cursore += altezza;
    }
    const spezza = (valori: string[]) => valori.map((v, i) => doc.splitTextToSize(v, larghezze[i] - 4) as string[]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const intestazioni = spezza(head);
    const intestazione = () => riga(head, intestazioni, 4 + Math.max(...intestazioni.map(v => v.length)) * 3.6, blu, true);
    intestazione();
    body.forEach((valori, i) => {
      doc.setFont("helvetica", "normal");
      const linee = spezza(valori);
      const altezza = Math.max(...linee.map(v => v.length)) * 3.6 + 3.5;
      if (cursore + altezza > 277) {
        doc.addPage();
        cursore = 18;
        intestazione();
      }
      riga(valori, linee, altezza, i % 2 === 0 ? [239, 244, 250] : [255, 255, 255]);
    });
  }
  tabella(["Costo stimato", "Vendita netta", "Margine", "Margine %", "Ricarico %", "Stato"],
    [[euro(analisi.costo), euroAnalisi.format(analisi.imponibile), euro(analisi.incompleto ? null : analisi.margine),
      percentuale(analisi.incompleto ? null : analisi.percentuale), percentuale(analisi.incompleto ? null : analisi.ricarico),
      analisi.incompleto ? "Parziale" : "Completo"]],
    [34, 34, 34, 28, 28, 24]);

  function sezione(titoloSezione: string, head: string[], body: string[][]) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...blu);
    const titolo = doc.splitTextToSize(titoloSezione, 182) as string[];
    if (cursore + 29 + titolo.length * 4 > 277) {
      doc.addPage();
      cursore = 18;
    }
    doc.text(titolo, 14, cursore + 8);
    cursore += 7 + titolo.length * 4;
    tabella(head, body, head.length === 6 ? [62, 19, 26, 26, 24, 25] : [61, 36, 36, 24, 25]);
  }
  const quote = quoteCostiComuni(analisi);
  const titoloVoce = (voce: Risultato["righe"][number]["voce"]) =>
    [voce.codice, voce.descrizione.split("\n")[0]].filter(Boolean).join(" · ") || "Lavorazione";
  sezione("Lavorazioni e alternative", ["Voce", "Quantità", "Costo completo", "Vendita netta", "Margine", "Stato"],
    analisi.righe.map(r => {
      const costo = costoCompletoVoce(r, quote.get(r.voce.id));
      const margine = costo === null || r.voce.vendita == null ? null : centesimiCosto(r.voce.vendita) - costo;
      return [titoloVoce(r.voce), r.voce.quantita == null ? "—" : `${r.voce.quantita} ${r.voce.unita}`,
        euro(costo), r.voce.vendita == null ? "—" : euroAnalisi.format(r.voce.vendita), euro(margine),
        !r.voce.inclusa ? "Fuori dal totale" : costo === null ? "Da completare" : "Inclusa"];
    }));

  const tempi = analisi.righe.flatMap(({ voce }) => {
    const t = tempistiche?.[voce.id];
    if (!t) return [];
    return [[titoloVoce(voce), formatoDataStima(t.inizio), formatoDataStima(t.fine),
      t.fineMin === t.fineMax ? "—" : `${formatoDataStima(t.fineMin)} – ${formatoDataStima(t.fineMax)}`,
      stimaTempiAggiornata(t, voce) ? `${t.giorni} gg operativi` : "Da ricalcolare"]];
  });
  if (tempi.length) sezione("Tempistiche previste", ["Voce", "Avvio stimato", "Fine stimata", "Finestra", "Stato"], tempi);
  const colonne = ["Risorsa e fonte", "Tipo", "Quantità × fattore", "Tariffa", "Importo"];
  const risorse = (righe: Risultato["generali"]["righe"]) => righe.map(r => [
    [r.risorsa.nome || "Risorsa da completare", r.risorsa.fonte].filter(Boolean).join("\n"),
    categorieCosto[r.risorsa.tipo],
    r.risorsa.base === "percentuale" ? "Sui costi diretti" :
      `${r.risorsa.quantita} ${r.risorsa.unita} × ${r.risorsa.fattore}${r.risorsa.base === "unitaria" ? " / unità" : ""}`,
    r.prezzo === null ? "—" : r.risorsa.base === "percentuale" ? percentuale(r.prezzo) : euroAnalisi.format(r.prezzo),
    euro(r.importo),
  ]);
  for (const r of analisi.righe) {
    if (!r.dettaglio.righe.length) continue;
    sezione(titoloVoce(r.voce), colonne, risorse(r.dettaglio.righe));
  }
  for (const fase of analisi.fasi) {
    if (fase.righe.length) sezione("Costi comuni · " + fase.fase, colonne, risorse(fase.righe));
  }
  if (analisi.generali.righe.length) sezione("Costi comuni del preventivo", colonne, risorse(analisi.generali.righe));
  const attribuiti = analisi.righe.flatMap(r => {
    const quota = quote.get(r.voce.id);
    return quota && (quota.fase || quota.preventivo || quota.parziale)
      ? [[titoloVoce(r.voce), euro(quota.fase), euro(quota.preventivo), euro(quota.fase + quota.preventivo), quota.parziale ? "Parziale" : "Completo"]]
      : [];
  });
  if (attribuiti.length) sezione("Ripartizione dei costi comuni", ["Voce", "Quota di fase", "Quota preventivo", "Quota totale", "Stato"], attribuiti);
  for (let pagina = 1; pagina <= doc.getNumberOfPages(); pagina++) {
    doc.setPage(pagina);
    doc.setDrawColor(205, 215, 225);
    doc.line(14, 282, 196, 282);
    doc.setTextColor(75, 91, 109);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Analisi interna  /  " + intestazione, 14, 288);
    doc.text(`${pagina} / ${doc.getNumberOfPages()}`, 196, 288, { align: "right" });
  }
  return doc.output("blob");
}
