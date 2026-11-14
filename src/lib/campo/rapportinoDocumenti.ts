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
import type { DocumentoOperativo, RigaDocumentoOperativo } from "@/lib/documentiOperativi/modello";
import { totaliQuadro, type FontePrezzo, type MancanzaCosto } from "@/lib/campo/prezzoVoceRapportino";

export interface PersonaQuadro {
  emp: string | null; nome: string; ditta: boolean; ore: number; costo_orario: number | null; costo: number | null;
  unita: string | null; quantita: number | null; prezzo: number | null; ricavo: number | null; prezzo_fonte?: FontePrezzo | null;
}
export interface MezzoQuadro { mezzo_id: string; nome: string | null; noleggio: boolean; ore: number; ore_stimate: boolean; costo_orario: number | null; importo: number | null }
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
const euro = (n: number | null | undefined): string =>
  n == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n));
const num = (n: number): string => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

/** «Rapporto lavori in economia» di un solo giorno, ai prezzi di vendita: per il committente. */
export function documentoPerCommittente(q: QuadroDocumento, info: InfoRapportino, destinatario: DocumentoOperativo["destinatario"]): DocumentoOperativo {
  const gruppo = `${dataIt(info.data)} - ${info.commessa ?? ""} - ${info.descrizione?.trim() || "Intervento"}`;
  const persone: RigaDocumentoOperativo[] = q.persone.filter((p) => p.ore > 0).map((p) => {
    const conPrezzo = !p.ditta && p.prezzo != null;
    return {
      gruppo,
      descrizione: `${p.ditta ? "Ditta" : "Manodopera"} - ${p.nome}`,
      unita: conPrezzo ? (UNITA[p.unita ?? ""] ?? p.unita ?? "h") : "h",
      quantita: conPrezzo && p.quantita != null ? Number(p.quantita) : Number(p.ore),
      prezzo: conPrezzo ? Number(p.prezzo) : null,
      ...(conPrezzo && p.ricavo != null ? { importo: Number(p.ricavo) } : {}),
      iva: null,
    };
  });
  // Mezzi: le ore si dichiarano; il prezzo, se si vende il nolo, si scrive nella bozza.
  const mezzi: RigaDocumentoOperativo[] = (q.mezzi ?? []).filter((m) => Number(m.ore) > 0).map((m) => ({
    gruppo, descrizione: `Mezzo - ${m.nome ?? "Mezzo"}`, unita: "h", quantita: Number(m.ore), prezzo: null, iva: null,
  }));
  const voci: RigaDocumentoOperativo[] = (q.voci ?? []).filter((v) => v.descrizione?.trim() && Number(v.quantita) > 0).map((v) => ({
    gruppo, descrizione: v.codice ? `${v.codice} - ${v.descrizione}` : v.descrizione, unita: v.unita || "cad",
    quantita: Number(v.quantita), prezzo: v.vendita_unitaria == null ? null : Number(v.vendita_unitaria), iva: null,
  }));
  return {
    tipo: "economia",
    numero: `RAP-${(info.commessa ?? "").replace(/\s+/g, "")}-${info.data.slice(0, 10)}`,
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
      costo: m.noleggio ? null : m.importo, ricavo: null,
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

/** PDF interno: costi sostenuti, o costi con ricavo e margine. */
export function pdfInterno(variante: VarianteInterna, q: QuadroDocumento, info: InfoRapportino, azienda: { nome: string; accento?: string }): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 14, inchiostro: [number, number, number] = [31, 41, 51], tenue: [number, number, number] = [107, 114, 128];
  const accento = /^#[0-9a-f]{6}$/i.test(azienda.accento ?? "") ? azienda.accento! : "#1E3A5F";
  const acc: [number, number, number] = [parseInt(accento.slice(1, 3), 16), parseInt(accento.slice(3, 5), 16), parseInt(accento.slice(5, 7), 16)];
  const tot = totaliQuadro({
    persone: q.persone, mezzi: q.mezzi, voci: q.voci, personaleAggregato: q.personale_aggregato?.costo ?? null, costoDaCompletare: q.costo_da_completare,
  });
  const conMargine = variante === "margine";
  let y = 16;
  pdf.setFont("helvetica", "bold").setFontSize(12).setTextColor(...inchiostro).text(azienda.nome, M, y);
  pdf.setFontSize(13).text(conMargine ? "Rapportino · costi e margine" : "Rapportino · costi sostenuti", W - M, y, { align: "right" });
  y += 5;
  pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...tenue).text("DOCUMENTO INTERNO — non inviare al cliente", W - M, y, { align: "right" });
  y += 3;
  pdf.setDrawColor(...acc).setLineWidth(0.5).line(M, y, W - M, y);
  y += 7;
  const campo = (etichetta: string, valore: string | null | undefined, x: number): void => {
    pdf.setFontSize(7).setTextColor(...tenue).text(etichetta.toUpperCase(), x, y);
    pdf.setFontSize(9.5).setTextColor(...inchiostro).text(pdf.splitTextToSize(valore || "—", 58)[0] ?? "—", x, y + 4.5);
  };
  campo("Giorno", dataIt(info.data), M); campo("Commessa", [info.commessa, info.commessaDescrizione].filter(Boolean).join(" · "), M + 32); campo("Cliente", info.cliente, M + 112);
  y += 11;
  if (info.descrizione?.trim()) {
    pdf.setFontSize(7).setTextColor(...tenue).text("COSA SI È FATTO", M, y); y += 4.5;
    const testo = pdf.splitTextToSize(info.descrizione.trim(), W - 2 * M) as string[];
    pdf.setFontSize(9.5).setTextColor(...inchiostro).text(testo.slice(0, 6), M, y); y += testo.slice(0, 6).length * 4.3 + 3;
  }
  // Tabella
  const colonne = conMargine
    ? [{ t: "Voce", x: M, w: 64 }, { t: "Dettaglio", x: M + 64, w: 52 }, { t: "Costo", x: M + 116, w: 22 }, { t: "Ricavo", x: M + 138, w: 22 }, { t: "Margine", x: M + 160, w: 22 }]
    : [{ t: "Voce", x: M, w: 80 }, { t: "Dettaglio", x: M + 80, w: 72 }, { t: "Costo", x: M + 152, w: 30 }];
  const intestazione = (): void => {
    pdf.setFillColor(238, 241, 245).rect(M, y - 4, W - 2 * M, 6.5, "F");
    pdf.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...tenue);
    colonne.forEach((c, i) => pdf.text(c.t.toUpperCase(), i >= 2 ? c.x + c.w - 1 : c.x + 1, y, { align: i >= 2 ? "right" : "left" }));
    pdf.setFont("helvetica", "normal"); y += 6;
  };
  intestazione();
  let gruppo = "";
  for (const r of righeInterne(q)) {
    if (y > 270) { pdf.addPage(); y = 18; intestazione(); }
    if (r.gruppo !== gruppo) {
      gruppo = r.gruppo;
      pdf.setFont("helvetica", "bold").setFontSize(8).setTextColor(...acc).text(gruppo.toUpperCase(), M + 1, y + 1); pdf.setFont("helvetica", "normal"); y += 5.5;
    }
    pdf.setFontSize(9).setTextColor(...inchiostro).text(pdf.splitTextToSize(r.voce, colonne[0].w - 2)[0], colonne[0].x + 1, y);
    const notaNelDettaglio = r.nota && r.costo != null ? ` · ${r.nota}` : "";
    pdf.setFontSize(8).setTextColor(...tenue).text(pdf.splitTextToSize(r.dettaglio + notaNelDettaglio, colonne[1].w - 2)[0], colonne[1].x + 1, y);
    pdf.setFontSize(9).setTextColor(...inchiostro);
    const destra = (c: { x: number; w: number }, v: string): void => { pdf.text(v, c.x + c.w - 1, y, { align: "right" }); };
    destra(colonne[2], r.costo == null ? (r.nota ?? "—") : euro(r.costo));
    if (conMargine) {
      destra(colonne[3], r.ricavo == null ? "—" : euro(r.ricavo));
      const m = r.costo != null && r.ricavo != null ? r.ricavo - r.costo : null;
      if (m != null && m < 0) pdf.setTextColor(185, 28, 28);
      destra(colonne[4], m == null ? "—" : euro(m));
      pdf.setTextColor(...inchiostro);
    }
    pdf.setDrawColor(227, 230, 235).setLineWidth(0.2).line(M, y + 2.2, W - M, y + 2.2);
    y += 6.2;
  }
  // Totali
  y += 2;
  pdf.setDrawColor(...acc).setLineWidth(0.4).line(M, y - 3, W - M, y - 3);
  pdf.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...inchiostro);
  pdf.text(tot.completo ? "Totale" : "Totale (costo parziale)", M + 1, y + 1);
  if (conMargine) {
    pdf.text(euro(tot.costo), colonne[2].x + colonne[2].w - 1, y + 1, { align: "right" });
    pdf.text(euro(tot.ricavo), colonne[3].x + colonne[3].w - 1, y + 1, { align: "right" });
    pdf.text(tot.margine == null ? "incompleto" : euro(tot.margine), colonne[4].x + colonne[4].w - 1, y + 1, { align: "right" });
    if (tot.marginePct != null) { y += 5; pdf.setFont("helvetica", "normal").setFontSize(8.5).text(`Margine sul ricavo: ${tot.marginePct.toLocaleString("it-IT")}%`, W - M - 1, y + 1, { align: "right" }); }
  } else {
    pdf.text(euro(tot.costo), colonne[2].x + colonne[2].w - 1, y + 1, { align: "right" });
  }
  pdf.setFont("helvetica", "normal");
  y += 8;
  const avvisi: string[] = [];
  if (!tot.completo) avvisi.push(`Costo da completare: ${(q.costo_da_completare ?? []).map((m) => `${m.nome} (${m.motivo})`).join(", ") || `${tot.mancano} voci`}. Il totale è parziale${conMargine ? " e il margine non si calcola" : ""}.`);
  if (conMargine && tot.prezziDaDefinire) avvisi.push(`${tot.prezziDaDefinire} prezzi da definire: il ricavo è parziale.`);
  avvisi.push(q.registrato ? "Costi registrati all'approvazione del rapportino." : "Costi stimati: il rapportino non è ancora approvato.");
  pdf.setFontSize(8).setTextColor(...tenue);
  for (const a of avvisi) { const t = pdf.splitTextToSize(a, W - 2 * M) as string[]; pdf.text(t, M, y); y += t.length * 3.8 + 1; }
  const pagine = pdf.getNumberOfPages();
  for (let i = 1; i <= pagine; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7).setTextColor(...tenue).text(`${azienda.nome} · documento interno · pagina ${i} di ${pagine}`, W / 2, 290, { align: "center" });
  }
  return pdf;
}
