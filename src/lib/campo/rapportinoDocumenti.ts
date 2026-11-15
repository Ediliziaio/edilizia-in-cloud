/**
 * I documenti che escono da un rapportino (14/11/2026, piano rapportino economico, lotto F).
 *
 * - Operativo: cosa è stato fatto, senza soldi. È il PDF di sempre (genera-pdf-rapportino).
 * - Per il committente: ore e voci ai prezzi di vendita (listino del committente o generale), niente
 *   costi né margini. È un «Rapporto lavori in economia» dei documenti operativi: anteprima, righe
 *   correggibili, invio per email, firma.
 * - Costi sostenuti (interno): ore × costo orario, mezzi, voci al costo.
 * - Con margine (interno): costo, ricavo e margine riga per riga.
 *
 * I due interni non si mandano a nessuno: lo dicono in testa e in piè di pagina.
 */
import { jsPDF } from "jspdf";
import { footerAzienda, type AziendaDocumento, type DocumentoOperativo, type RigaDocumentoOperativo } from "@/lib/documentiOperativi/modello";
import {
  disegnaPiedeJsPdf, fontPiedeBase64, limiteContenutoJsPdf, personalizzazioneDocumento, puntiInMm as mm,
} from "../../../supabase/functions/_shared/personalizzazioneDocumenti";
import {
  accentoDocumento, colore, pagina, rgb255, riquadro as stileRiquadro, sezione as stileSezione, tabella as stileTabella, testata as stileTestata,
} from "../../../supabase/functions/_shared/stileDocumenti";

type Rgb = [number, number, number];
import { totaliQuadro, type FontePrezzo, type MancanzaCosto } from "@/lib/campo/prezzoVoceRapportino";

export interface PersonaQuadro {
  emp: string | null; nome: string; ditta: boolean; ore: number; costo_orario: number | null; costo: number | null;
  unita: string | null; quantita: number | null; prezzo: number | null; ricavo: number | null; prezzo_fonte?: FontePrezzo | null;
}
export interface MezzoQuadro {
  mezzo_id: string; nome: string | null; noleggio: boolean; ore: number; ore_stimate: boolean; costo_orario: number | null; importo: number | null;
  prezzo?: number | null; ricavo?: number | null; unita?: string | null; quantita?: number | null; prezzo_fonte?: FontePrezzo | null;
}
export interface VoceQuadro {
  id: string; descrizione: string; quantita: number; unita: string; costo_unitario: number | null; vendita_unitaria: number | null;
  codice?: string | null; prezzo_fonte?: FontePrezzo | null; vendita_proposta?: number | null; prezzo_a_mano?: boolean | null;
}
export interface QuadroDocumento {
  persone: PersonaQuadro[]; mezzi?: MezzoQuadro[]; voci?: VoceQuadro[];
  personale_aggregato?: { costo: number | null }; costo_da_completare?: MancanzaCosto[]; registrato?: boolean;
}
export interface InfoRapportino {
  data: string; descrizione: string | null; commessa: string | null; commessaDescrizione?: string | null;
  luogo?: string | null; cliente?: string | null;
}

const UNITA: Record<string, string> = { ora: "h", h: "h", giornata: "giornata", uomo_giorno: "giornata" };
const dataIt = (iso: string): string => { const [a, m, g] = iso.slice(0, 10).split("-"); return g && m && a ? `${g}/${m}/${a}` : iso; };
/** 1.235,19 € anche sotto i diecimila (l'italiano di Intl non raggruppa le quattro cifre). */
const euro = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const [intero, decimali] = Math.abs(Number(n)).toFixed(2).split(".");
  return `${Number(n) < 0 ? "-" : ""}${intero.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimali} €`;
};
const num = (n: number): string => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

/** «Rapporto lavori in economia» di un solo giorno, ai prezzi di vendita: per il committente. */
export function documentoPerCommittente(q: QuadroDocumento, info: InfoRapportino, destinatario: DocumentoOperativo["destinatario"]): DocumentoOperativo {
  const gruppo = `${dataIt(info.data)} - ${info.commessa ?? ""} - ${info.descrizione?.trim() || "Intervento"}`;
  const persone: RigaDocumentoOperativo[] = q.persone.filter((p) => p.ore > 0).map((p) => {
    const conPrezzo = p.prezzo != null;
    return {
      gruppo,
      descrizione: `${p.ditta ? "Ditta" : "Manodopera"} - ${p.nome}`,
      unita: conPrezzo ? (UNITA[p.unita ?? ""] ?? p.unita ?? "h") : "h",
      quantita: conPrezzo && p.quantita != null ? Number(p.quantita) : Number(p.ore),
      prezzo: conPrezzo ? Number(p.prezzo) : null,
      ...(conPrezzo && p.ricavo != null ? { importo: Number(p.ricavo) } : {}),
      iva: null as number | null,
    };
  });
  // Mezzi: col nolo del listino collegato al mezzo; senza, il prezzo si scrive nella bozza.
  const mezzi: RigaDocumentoOperativo[] = (q.mezzi ?? []).filter((m) => Number(m.ore) > 0).map((m) => {
    const conPrezzo = m.prezzo != null;
    return {
      gruppo, descrizione: `Mezzo - ${m.nome ?? "Mezzo"}`,
      unita: conPrezzo ? (UNITA[m.unita ?? ""] ?? m.unita ?? "h") : "h",
      quantita: conPrezzo && m.quantita != null ? Number(m.quantita) : Number(m.ore),
      prezzo: conPrezzo ? Number(m.prezzo) : null as number | null,
      ...(conPrezzo && m.ricavo != null ? { importo: Number(m.ricavo) } : {}),
      iva: null as number | null,
    };
  });
  const voci: RigaDocumentoOperativo[] = (q.voci ?? []).filter((v) => v.descrizione?.trim() && Number(v.quantita) > 0).map((v) => ({
    gruppo, descrizione: v.codice ? `${v.codice} - ${v.descrizione}` : v.descrizione, unita: v.unita || "cad",
    quantita: Number(v.quantita), prezzo: v.vendita_unitaria == null ? null : Number(v.vendita_unitaria), iva: null as number | null,
  }));
  return {
    tipo: "economia",
    numero: `RAP-${info.data.slice(0, 10).replace(/-/g, "")}`,
    data: info.data.slice(0, 10),
    periodo: dataIt(info.data),
    destinatario,
    commessa: info.commessa,
    luogo: info.luogo ?? null,
    note: null,
    righe: [...persone, ...mezzi, ...voci],
  };
}

export type VarianteInterna = "costi" | "margine";

interface RigaInterna { gruppo: string; voce: string; dettaglio: string; costo: number | null; ricavo: number | null; nota?: string }

/** Le righe dei documenti interni: costo sempre, ricavo e margine solo nella variante «margine». */
export function righeInterne(q: QuadroDocumento): RigaInterna[] {
  const righe: RigaInterna[] = [];
  if (q.personale_aggregato) righe.push({ gruppo: "Manodopera", voce: "Personale interno (aggregato)", dettaglio: "", costo: q.personale_aggregato.costo, ricavo: null });
  for (const p of q.persone.filter((x) => x.ore > 0)) {
    righe.push({
      gruppo: "Manodopera", voce: p.nome,
      dettaglio: p.ditta ? `${num(p.ore)} h · ditta esterna` : p.costo_orario != null ? `${num(p.ore)} h × ${euro(p.costo_orario)}/h` : `${num(p.ore)} h · manca il costo orario`,
      costo: p.ditta ? null : p.costo, ricavo: p.ricavo,
      nota: p.ditta ? "da contratto" : p.costo == null ? "da completare" : undefined,
    });
  }
  for (const m of q.mezzi ?? []) {
    righe.push({
      gruppo: "Mezzi", voce: m.nome ?? "Mezzo",
      dettaglio: m.noleggio ? `${num(m.ore)} h · noleggio` : m.costo_orario != null ? `${num(m.ore)} h × ${euro(m.costo_orario)}/h` : `${num(m.ore)} h · manca il costo orario`,
      costo: m.noleggio ? null : m.importo, ricavo: m.ricavo ?? null,
      nota: m.noleggio ? "da fattura" : m.importo == null ? "da completare" : undefined,
    });
  }
  for (const v of q.voci ?? []) {
    const q2 = Number(v.quantita);
    righe.push({
      gruppo: "Voci", voce: v.codice ? `${v.codice} · ${v.descrizione}` : v.descrizione,
      dettaglio: `${num(q2)} ${v.unita}${v.costo_unitario != null ? ` × ${euro(v.costo_unitario)}` : ""}`,
      costo: v.costo_unitario == null ? null : Math.round(q2 * Number(v.costo_unitario) * 100) / 100,
      ricavo: v.vendita_unitaria == null ? null : Math.round(q2 * Number(v.vendita_unitaria) * 100) / 100,
      nota: v.prezzo_fonte === "mancante" && v.vendita_unitaria == null ? "prezzo da definire" : v.prezzo_a_mano && v.prezzo_fonte ? "prezzo a mano" : undefined,
    });
  }
  return righe;
}

/** PDF interno: costi sostenuti, o costi con ricavo e margine. Stesso stile dei documenti operativi. */
export function pdfInterno(variante: VarianteInterna, q: QuadroDocumento, info: InfoRapportino, a: AziendaDocumento, logo?: string): jsPDF {
  const veste = personalizzazioneDocumento(a.id);
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: Boolean(logo) });
  const conMargine = variante === "margine";
  const titolo = conMargine ? "Rapportino · costi e margine" : "Rapportino · costi sostenuti";
  pdf.setProperties({ title: `${titolo} ${info.commessa ?? ""} ${info.data}`, author: a.business_name || a.name, subject: titolo });
  const left = mm(pagina.margineLaterale), width = 210 - left * 2, bottom = limiteContenutoJsPdf(veste, width, 268);
  const INCHIOSTRO = rgb255(colore.inchiostro), TENUE = rgb255(colore.testoTenue), LINEA = rgb255(colore.linea);
  const FONDO = rgb255(colore.fondoTenue), FONDO_INT = rgb255(colore.fondoIntestazione), AVVISO = rgb255(colore.avviso);
  const POSITIVO = rgb255(colore.positivo), NEGATIVO: Rgb = [185, 28, 28];
  const ACCENTO = rgb255(accentoDocumento({ coloreVeste: veste.piedeColore, coloreAzienda: a.brand_primary_color }));
  const safe = (v: string) => v.replace(/\u00a0|\u202f/g, " ").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const font = (size: number, bold = false, tinta: Rgb = INCHIOSTRO) => { pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(...tinta); };
  const passo = (size: number, interlinea: number = pagina.interlinea) => mm(size * interlinea);
  const filetto = (tinta: Rgb, spessore: number, x1: number, y1: number, x2: number, y2: number) => { pdf.setDrawColor(...tinta); pdf.setLineWidth(mm(spessore)); pdf.line(x1, y1, x2, y2); };
  const e = (n: number | null | undefined) => (n == null ? "—" : safe(euro(n)));
  const tot = totaliQuadro({ persone: q.persone, mezzi: q.mezzi, voci: q.voci, personaleAggregato: q.personale_aggregato?.costo ?? null, costoDaCompletare: q.costo_da_completare });
  let y = mm(pagina.margineAlto);

  const testata = () => {
    const top = mm(pagina.margineAlto);
    let hSx = 0, wSx = 0, img: { tipo: string; w: number; h: number } | null = null, ragione: string[] = [];
    const passoRagione = passo(stileTestata.ragioneSocialeCorpo, 1.2);
    // Il titolo ha la sua colonna a destra: il logo si ferma prima, anche se è largo (Vulcano: logo e certificazioni).
    font(stileTestata.titoloCorpo, true);
    const spazioTitolo = Math.max(pdf.getTextWidth(safe(titolo)), 62) + 8;
    if (logo) {
      const p = pdf.getImageProperties(logo);
      const maxH = mm(veste.logoAltezza ?? stileTestata.logoAltezza);
      const maxW = Math.min(mm(veste.logoLarghezzaMax ?? stileTestata.logoLarghezzaMax), width - spazioTitolo);
      const r = p.width / p.height;
      wSx = Math.min(maxW, maxH * r); hSx = wSx / r; img = { tipo: p.fileType, w: wSx, h: hSx };
    } else {
      font(stileTestata.ragioneSocialeCorpo, true);
      ragione = (pdf.splitTextToSize(safe(a.business_name || a.name), width * 0.5) as string[]).slice(0, 2);
      wSx = Math.max(...ragione.map((t) => pdf.getTextWidth(t))); hSx = ragione.length * passoRagione;
    }
    const passoTitolo = passo(stileTestata.titoloCorpo, 1.2);
    const hDx = passoTitolo + passo(stileTestata.sottotitoloCorpo, 1.3);
    const fondo = top + Math.max(hSx, hDx);
    if (img) pdf.addImage(logo!, img.tipo, left, fondo - img.h, img.w, img.h);
    else { font(stileTestata.ragioneSocialeCorpo, true); ragione.forEach((t, i) => pdf.text(t, left, fondo - hSx + passoRagione * (i + 0.78))); }
    font(stileTestata.titoloCorpo, true);
    pdf.text(safe(titolo), left + width, fondo - hDx + passoTitolo * 0.78, { align: "right" });
    font(stileTestata.sottotitoloCorpo, false, TENUE);
    pdf.text(safe([info.commessa, dataIt(info.data)].filter(Boolean).join(" · ")), left + width, fondo - 0.8, { align: "right" });
    const yF = fondo + mm(stileTestata.filettoDistanza);
    filetto(ACCENTO, stileTestata.filettoSpessore, left, yF, left + width, yF);
    // Sotto il filetto, una fascia: il documento non si manda al cliente.
    pdf.setFillColor(254, 243, 199);
    pdf.rect(left, yF + 2, width, 5.2, "F");
    font(7.5, true, AVVISO);
    pdf.text(`DOCUMENTO INTERNO · CONTIENE ${conMargine ? "COSTI E MARGINI" : "I COSTI"} · NON INVIARE AL CLIENTE`, left + width / 2, yF + 5.5, { align: "center", charSpace: mm(0.3) });
    y = yF + 7.2 + mm(stileTestata.spazioDopo) * 0.6;
  };
  const riquadro = (x: number, yy: number, w: number, h: number) => {
    pdf.setFillColor(...FONDO); pdf.setDrawColor(...LINEA); pdf.setLineWidth(mm(stileRiquadro.bordo));
    pdf.roundedRect(x, yy, w, h, mm(stileRiquadro.raggio), mm(stileRiquadro.raggio), "FD");
  };
  const etichetta = (t: string, x: number, base: number, align: "left" | "right" = "left") => {
    font(stileRiquadro.etichettaCorpo, false, TENUE); pdf.text(safe(t).toUpperCase(), x, base, { align, charSpace: mm(0.5) });
  };
  const sezione = (t: string) => {
    y += mm(stileSezione.spazioPrima);
    font(stileSezione.corpo, true, ACCENTO);
    pdf.text(safe(t).toUpperCase(), left, y, { charSpace: mm(stileSezione.spaziatura) });
    filetto(LINEA, stileSezione.filetto, left, y + 1.6, left + width, y + 1.6);
    y += 1.6 + mm(stileSezione.spazioDopo);
  };
  testata();

  // Riquadri: giorno, commessa, cliente.
  const pad = mm(stileRiquadro.padding), gap = 4, h1 = 15;
  const colonne3 = [width * 0.2, width * 0.42, width * 0.38 - 2 * gap];
  let x = left;
  ([["Giorno", dataIt(info.data)], ["Commessa", [info.commessa, info.commessaDescrizione].filter(Boolean).join(" · ")], ["Cliente", info.cliente ?? "—"]] as const)
    .forEach(([et, val], i) => {
      riquadro(x, y, colonne3[i], h1);
      etichetta(et, x + pad, y + pad + 1.2);
      font(stileRiquadro.valoreCorpo);
      pdf.text((pdf.splitTextToSize(safe(val || "—"), colonne3[i] - 2 * pad) as string[])[0] ?? "—", x + pad, y + h1 - pad + 0.5);
      x += colonne3[i] + gap;
    });
  y += h1 + 3;

  // Numeri: costo, ricavo, margine.
  const numeri: Array<[string, string, Rgb, string]> = conMargine
    ? [["Costo sostenuto", e(tot.costo), tot.completo ? INCHIOSTRO : AVVISO, tot.completo ? "" : "parziale"],
       ["Ricavo", e(tot.ricavo), tot.prezziDaDefinire ? AVVISO : INCHIOSTRO, tot.prezziDaDefinire ? "parziale" : ""],
       ["Margine", tot.margine == null ? "incompleto" : e(tot.margine), tot.margine == null ? AVVISO : tot.margine < 0 ? NEGATIVO : POSITIVO,
        tot.marginePct != null ? `${tot.marginePct.toLocaleString("it-IT")}% del ricavo` : ""]]
    : [["Ore", `${num(q.persone.reduce((s, p) => s + Number(p.ore), 0))} h`, INCHIOSTRO, "persone e ditte"],
       ["Costo sostenuto", e(tot.costo), tot.completo ? INCHIOSTRO : AVVISO, tot.completo ? "completo" : "parziale: costi da completare"]];
  const wN = (width - gap * (numeri.length - 1)) / numeri.length, h2 = 17;
  x = left;
  for (const [et, val, tinta, sotto] of numeri) {
    riquadro(x, y, wN, h2);
    etichetta(et, x + pad, y + pad + 1.2);
    font(stileRiquadro.numeroCorpo, true, tinta); pdf.text(safe(val), x + pad, y + pad + 7.5);
    if (sotto) { font(7.5, false, TENUE); pdf.text(safe(sotto), x + pad, y + h2 - 2); }
    x += wN + gap;
  }
  y += h2 + 2;

  if (info.descrizione?.trim()) {
    sezione("Cosa si è fatto");
    font(pagina.corpo);
    const righe = (pdf.splitTextToSize(safe(info.descrizione.trim()), width) as string[]).slice(0, 8);
    righe.forEach((t) => { pdf.text(t, left, y + passo(pagina.corpo) * 0.72); y += passo(pagina.corpo); });
  }

  // Tabella.
  sezione("Dettaglio");
  const col = conMargine
    ? [{ t: "Voce", x: left, w: width * 0.32 }, { t: "Dettaglio", x: left + width * 0.32, w: width * 0.3 },
       { t: "Costo", x: left + width * 0.62, w: width * 0.13 }, { t: "Ricavo", x: left + width * 0.75, w: width * 0.125 }, { t: "Margine", x: left + width * 0.875, w: width * 0.125 }]
    : [{ t: "Voce", x: left, w: width * 0.4 }, { t: "Dettaglio", x: left + width * 0.4, w: width * 0.42 }, { t: "Costo", x: left + width * 0.82, w: width * 0.18 }];
  const hRiga = mm(stileTabella.altezzaRigaMin);
  const intestazione = () => {
    pdf.setFillColor(...FONDO_INT); pdf.rect(left, y, width, hRiga * 0.85, "F");
    font(stileTabella.intestazioneCorpo, true, TENUE);
    col.forEach((c, i) => pdf.text(c.t.toUpperCase(), i >= 2 ? c.x + c.w - 1.5 : c.x + 1.5, y + hRiga * 0.55, { align: i >= 2 ? "right" : "left", charSpace: mm(0.3) }));
    y += hRiga * 0.85;
  };
  intestazione();
  let gruppo = "";
  for (const r of righeInterne(q)) {
    if (y + hRiga * 2 > bottom) { pdf.addPage(); testata(); intestazione(); }
    if (r.gruppo !== gruppo) {
      gruppo = r.gruppo;
      font(stileTabella.intestazioneCorpo, true, ACCENTO);
      pdf.text(safe(gruppo).toUpperCase(), left + 1.5, y + hRiga * 0.62, { charSpace: mm(0.4) });
      y += hRiga * 0.8;
    }
    const base = y + hRiga * 0.62;
    font(stileTabella.corpo);
    pdf.text((pdf.splitTextToSize(safe(r.voce), col[0].w - 3) as string[])[0], col[0].x + 1.5, base);
    const notaNelDettaglio = r.nota && r.costo != null ? ` · ${r.nota}` : "";
    font(stileTabella.corpo - 1, false, TENUE);
    pdf.text((pdf.splitTextToSize(safe(r.dettaglio + notaNelDettaglio), col[1].w - 3) as string[])[0], col[1].x + 1.5, base);
    const destra = (c: { x: number; w: number }, v: string, tinta: Rgb = INCHIOSTRO, bold = false) => { font(stileTabella.corpo, bold, tinta); pdf.text(safe(v), c.x + c.w - 1.5, base, { align: "right" }); };
    destra(col[2], r.costo == null ? (r.nota ?? "—") : e(r.costo), r.costo == null && r.nota === "da completare" ? AVVISO : r.costo == null ? TENUE : INCHIOSTRO);
    if (conMargine) {
      destra(col[3], r.ricavo == null ? (r.nota === "prezzo da definire" ? "da definire" : "—") : e(r.ricavo), r.ricavo == null ? TENUE : INCHIOSTRO);
      const m = r.costo != null && r.ricavo != null ? r.ricavo - r.costo : null;
      destra(col[4], m == null ? "—" : e(m), m == null ? TENUE : m < 0 ? NEGATIVO : POSITIVO, m != null);
    }
    filetto(LINEA, stileTabella.filetto, left, y + hRiga, left + width, y + hRiga);
    y += hRiga;
  }
  // Totale.
  if (y + hRiga * 1.4 > bottom) { pdf.addPage(); testata(); }
  filetto(ACCENTO, stileTabella.filettoTotale, left, y + 0.6, left + width, y + 0.6);
  const baseT = y + hRiga * 0.75;
  font(stileTabella.corpo, true);
  pdf.text(tot.completo ? "Totale" : "Totale (costo parziale)", left + 1.5, baseT);
  pdf.text(e(tot.costo), col[2].x + col[2].w - 1.5, baseT, { align: "right" });
  if (conMargine) {
    pdf.text(e(tot.ricavo), col[3].x + col[3].w - 1.5, baseT, { align: "right" });
    font(stileTabella.corpo, true, tot.margine == null ? AVVISO : tot.margine < 0 ? NEGATIVO : POSITIVO);
    pdf.text(tot.margine == null ? "incompleto" : e(tot.margine), col[4].x + col[4].w - 1.5, baseT, { align: "right" });
  }
  y += hRiga * 1.3;

  // Avvisi.
  const avvisi: string[] = [];
  if (!tot.completo) avvisi.push(`Costo da completare: ${(q.costo_da_completare ?? []).map((m) => `${m.nome} (${m.motivo})`).join(", ") || `${tot.mancano} voci`}. Il totale è parziale${conMargine ? " e il margine non si calcola" : ""}.`);
  if (conMargine && tot.prezziDaDefinire) avvisi.push(`${tot.prezziDaDefinire} ${tot.prezziDaDefinire === 1 ? "prezzo" : "prezzi"} da definire: il ricavo è parziale.`);
  avvisi.push(q.registrato ? "Costi e prezzi fissati all'approvazione del rapportino: un listino cambiato dopo non li tocca." : "Costi stimati: il rapportino non è ancora approvato.");
  font(pagina.nota, false, TENUE);
  for (const t of avvisi) {
    const righe = pdf.splitTextToSize(safe(t), width) as string[];
    if (y + righe.length * passo(pagina.nota) > bottom) { pdf.addPage(); testata(); }
    pdf.text(righe, left, y + passo(pagina.nota) * 0.72); y += righe.length * passo(pagina.nota) + 1;
  }

  // Piè: i dati societari (o il piè proprio dell'azienda), come negli altri documenti.
  const foot = a.righeSocietarie?.length ? a.righeSocietarie : footerAzienda(a);
  if (a.fontPiede) { pdf.addFileToVFS("EBGaramond-Regular.ttf", a.fontPiede); pdf.addFont("EBGaramond-Regular.ttf", "EBGaramond", "normal"); }
  const pagine = pdf.getNumberOfPages();
  for (let n = 1; n <= pagine; n++) {
    pdf.setPage(n);
    const numero = `Documento interno · Pag. ${n} / ${pagine}`;
    if (veste.piedeRighe) {
      disegnaPiedeJsPdf(pdf, veste, { font: a.fontPiede ? "EBGaramond" : "helvetica", pulisci: a.fontPiede ? undefined : safe, larghezzaUtile: width, pagina: numero });
      continue;
    }
    const basePagina = 290, passoPiede = passo(7, 1.35), ultima = basePagina - passoPiede - 0.6;
    foot.filter(Boolean).forEach((line, i, arr) => {
      font(7, false, TENUE);
      const t = safe(line), tw = pdf.getTextWidth(t);
      if (tw > width) pdf.setFontSize((7 * width) / tw);
      pdf.text(t, 105, ultima - (arr.length - 1 - i) * passoPiede, { align: "center" });
    });
    font(7, false, TENUE); pdf.text(numero, 105, basePagina, { align: "center" });
  }
  return pdf;
}

/** Carica logo e dati societari dell'azienda e crea il PDF interno, come `generaPdfOperativo`. */
export async function generaPdfInterno(variante: VarianteInterna, q: QuadroDocumento, info: InfoRapportino, a: AziendaDocumento): Promise<Blob> {
  let logo: string | undefined;
  if (a.logo_url) {
    try {
      const risposta = await fetch(a.logo_url, { signal: AbortSignal.timeout(15000) });
      if (risposta.ok) {
        const immagine = await createImageBitmap(await risposta.blob());
        try {
          const canvas = document.createElement("canvas");
          canvas.width = immagine.width; canvas.height = immagine.height;
          canvas.getContext("2d")?.drawImage(immagine, 0, 0);
          logo = canvas.toDataURL("image/png");
        } finally { immagine.close(); }
      }
    } catch { /* Senza logo si scrive la ragione sociale: il documento esce lo stesso. */ }
  }
  const [{ supabase }, societari] = await Promise.all([import("@/integrations/supabase/client"), import("../../../supabase/functions/_shared/datiSocietari")]);
  const righeSocietarie = societari.righeSocietarie(await societari.caricaDatiSocietari(supabase, a.id));
  const fontPiede = personalizzazioneDocumento(a.id).piedeFont ? await fontPiedeBase64() : null;
  return pdfInterno(variante, q, info, { ...a, righeSocietarie, fontPiede }, logo).output("blob");
}
