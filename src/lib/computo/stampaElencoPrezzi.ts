/**
 * L'Elenco prezzi unitari (EPU) del preventivo con computo (29/10/2026): il
 * documento che i tecnici e le gare chiedono accanto al computo. Una voce per
 * riga, raggruppate per capitolo: numero, codice, descrizione completa, unità
 * di misura, prezzo in cifre e IN LETTERE («euro dodici/50»), come nei
 * capitolati. Niente quantità né importi: è il listino del lavoro.
 */
import type { jsPDF } from "jspdf";
import type { IntestazioneComputo } from "./esportaComputo";
import { alberoComputo, numeroVoce, tariffaVoce, type NodoComputo, type VoceComputo } from "./alberoComputo";
import { formatEuro } from "./computoStrutturato";
import { creaTema } from "@/components/preventivi/pdf/temaDocumento";

const UNITA = ["", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"];
const DECINE = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];

function sottoMille(n: number): string {
  const c = Math.floor(n / 100), r = n % 100;
  const centinaia = c === 0 ? "" : c === 1 ? "cento" : `${UNITA[c]}cento`;
  let resto: string;
  if (r < 20) resto = UNITA[r];
  else {
    const d = DECINE[Math.floor(r / 10)], u = r % 10;
    // «ventuno», «trentotto»: la vocale della decina cade davanti a «uno» e «otto».
    resto = (u === 1 || u === 8 ? d.slice(0, -1) : d) + UNITA[u];
  }
  // «centottanta»: cade la «o» di «cento» davanti a «ottanta»/«otto».
  return (centinaia && /^o/.test(resto) ? centinaia.slice(0, -1) : centinaia) + resto;
}

/** Un intero in lettere, all'italiana: 1.250 → «milleduecentocinquanta». */
export function interoInLettere(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zero";
  const parti: string[] = [];
  const miliardi = Math.floor(n / 1e9), milioni = Math.floor(n / 1e6) % 1000, migliaia = Math.floor(n / 1000) % 1000, resto = n % 1000;
  if (miliardi) parti.push(miliardi === 1 ? "unmiliardo" : `${sottoMille(miliardi)}miliardi`);
  if (milioni) parti.push(milioni === 1 ? "unmilione" : `${sottoMille(milioni)}milioni`);
  if (migliaia) parti.push(migliaia === 1 ? "mille" : `${sottoMille(migliaia)}mila`);
  if (resto) parti.push(sottoMille(resto));
  return parti.join("");
}

/** Il prezzo come nei capitolati: 12,5 → «euro dodici/50». */
export function prezzoInLettere(prezzo: number): string {
  const centesimi = Math.round(Math.abs(prezzo) * 100);
  return `euro ${interoInLettere(Math.floor(centesimi / 100))}/${String(centesimi % 100).padStart(2, "0")}`;
}

export function disegnaElencoPrezzi(doc: jsPDF, voci: VoceComputo[], i: IntestazioneComputo): jsPDF {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const m = 36, destra = W - m, larghezza = W - m * 2, fondo = H - 46;
  const t = creaTema({ primario: i.colore });
  const { nodi } = alberoComputo(voci);
  const font = (size: number, bold = false, colore = t.inchiostro) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(colore); };
  const avvolgi = (s: string, w: number) => doc.splitTextToSize(s, w) as string[];
  const col = { n: m, codice: m + 30, desc: m + 108, um: destra - 168, cifre: destra - 120, lettere: destra };
  const largDesc = col.um - col.desc - 10;
  let y = m;
  const testataColonne = () => {
    doc.setFillColor(t.fondo); doc.rect(m, y - 10, larghezza, 16, "F");
    font(6.5, true, t.bianco);
    doc.text("N.", col.n + 4, y); doc.text("CODICE", col.codice, y); doc.text("DESCRIZIONE DELLA LAVORAZIONE", col.desc, y);
    doc.text("U.M.", col.um, y); doc.text("PREZZO", col.cifre + 44, y, { align: "right" }); doc.text("IN LETTERE", col.lettere - 4, y, { align: "right" });
    y += 16;
  };
  const nuovaPagina = () => {
    doc.addPage(); y = m;
    font(8.5, true, t.inchiostroMarca); doc.text(i.azienda || "Elenco prezzi unitari", m, y);
    font(7.5, false, t.grigio); doc.text(`Elenco prezzi · ${i.titolo}`.slice(0, 110), destra, y, { align: "right" }); y += 20;
    testataColonne();
  };
  const serve = (h: number) => { if (y + h > fondo) nuovaPagina(); };

  // Testata del documento.
  doc.setFillColor(t.fondo); doc.rect(0, 0, W, 60, "F");
  font(12, true, t.bianco); doc.text(i.azienda || "", m, 28);
  if (i.dettagliAzienda) { font(7, false, t.bianco); doc.text(i.dettagliAzienda.slice(0, 160), m, 42); }
  y = 90;
  font(7, true, t.inchiostroMarca); doc.text("E L E N C O   P R E Z Z I   U N I T A R I", m, y); y += 18;
  font(17, true); for (const r of avvolgi(i.titolo, larghezza).slice(0, 3)) { doc.text(r, m, y); y += 20; }
  const dati = [["Committente", i.nascondiCliente ? "" : i.committente ?? ""], ["Luogo dei lavori", i.nascondiCliente ? "" : i.indirizzoIntervento ?? ""], ["Data", i.dataDocumento ?? ""], ["Riferimenti dei prezzi", i.riferimentoPrezzi ?? ""]].filter(([, v]) => v.trim());
  for (const [k, v] of dati) { font(6.5, true, t.grigioChiaro); doc.text(k.toUpperCase(), m, y); font(8.5); avvolgi(v, larghezza).slice(0, 2).forEach((r, n) => doc.text(r, m, y + 11 + n * 10)); y += 28; }
  y += 6; testataColonne();

  const riga = (v: VoceComputo) => {
    const descrizione = (v.descrizione_estesa || v.descrizione_breve || "").trim();
    const prezzo = v.prezzo_unitario_computo ?? 0;
    const lettere = avvolgi(prezzoInLettere(prezzo), 110);
    const righe = avvolgi(descrizione, largDesc);
    const alto = Math.max(righe.length, lettere.length) * 9.5 + 8;
    // Una descrizione lunghissima si spezza fra le pagine: il prezzo resta con la sua prima riga.
    let k = 0;
    serve(Math.min(alto, 60));
    font(7.5, true); doc.text(numeroVoce(v), col.n + 4, y);
    font(7, false, t.grigio); doc.text(tariffaVoce(v).slice(0, 18), col.codice, y);
    font(7.5); doc.text(v.unita_misura ?? "", col.um, y);
    font(7.8, true); doc.text(formatEuro(prezzo), col.cifre + 44, y, { align: "right" });
    font(6.8, false, t.grigio); lettere.forEach((r, n) => doc.text(r, col.lettere - 4, y + n * 9.5, { align: "right" }));
    const yInizio = y;
    while (k < righe.length) {
      if (y + 9.5 > fondo) nuovaPagina();
      font(7.5); doc.text(righe[k], col.desc, y); y += 9.5; k++;
    }
    y = Math.max(y, yInizio + lettere.length * 9.5) + 6;
    doc.setDrawColor(t.filetto); doc.setLineWidth(0.3); doc.line(m, y - 3, destra, y - 3); y += 4;
  };
  const visita = (n: NodoComputo, livello: number) => {
    serve(40);
    if (livello === 0) { doc.setFillColor(t.tinta); doc.rect(m, y - 9, larghezza, 15, "F"); font(8, true, t.inchiostroMarca); doc.text(n.nome.toUpperCase().slice(0, 100), m + 6, y + 1); y += 16; }
    else { font(7.5, true, t.inchiostroMarca); doc.text(n.nome.slice(0, 120), m + 6, y); y += 12; }
    n.voci.forEach(riga); n.figli.forEach(f => visita(f, livello + 1));
  };
  nodi.forEach(n => visita(n, 0));
  if (!voci.length) { font(9, false, t.grigio); doc.text("Le voci compariranno qui.", m, y); }

  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p); doc.setDrawColor(t.filetto); doc.line(m, H - 30, destra, H - 30);
    font(6.5, false, t.grigioChiaro); doc.text((i.stato || i.veste?.piePagina || i.azienda || "").slice(0, 100), m, H - 18);
    doc.text(`Pagina ${p} di ${pagine}`, destra, H - 18, { align: "right" });
  }
  return doc;
}
