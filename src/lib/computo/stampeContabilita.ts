/**
 * Stampe PDF della contabilità dei lavori pubblici, nel formato classico:
 * elenco prezzi, libretto delle misure, registro di contabilità, stato
 * d'avanzamento lavori, certificato di pagamento, quadro di confronto della
 * perizia di variante. jsPDF, A4; intestazione con stazione appaltante,
 * lavori, CIG, CUP, impresa, contratto.
 */
import { formatEuro } from "./computoStrutturato";
import { nomeFileComputo } from "./esportaComputo";
import type {
  CalcoloSal, CertificatoPagamento, ConfrontoVariante, ProgressivoRegistrazione, RigaElencoPrezzi, Registro, RigaMisura,
} from "./contabilitaLavori";
import { quantitaRiga } from "./contabilitaLavori";

export interface IntestazioneContabilita {
  lavori: string;
  stazioneAppaltante?: string | null;
  impresa?: string | null;
  cig?: string | null;
  cup?: string | null;
  contratto?: string | null;
  direttoreLavori?: string | null;
  rup?: string | null;
  ribasso?: number | null;
}

type Allinea = "left" | "right";
interface Colonna { titolo: string; larghezza: number; allinea?: Allinea }
type Cella = string | { testo: string; grassetto?: boolean; corsivo?: boolean };

const euro = (n: number | null | undefined) => (n == null ? "" : formatEuro(n));
const q = (n: number | null | undefined, dec = 2) => n == null ? "" : n.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: Math.max(dec, 3) });
const pct = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 4 });
const dataIt = (s: string | null | undefined) => s ? new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT") : "";

async function nuovoDoc(orizzontale: boolean) {
  const mod = await import("jspdf");
  const JsPDF = mod.default ?? (mod as typeof mod & { jsPDF?: typeof mod.default }).jsPDF;
  return new JsPDF({ orientation: orizzontale ? "landscape" : "portrait", unit: "pt", format: "a4" });
}
type Doc = Awaited<ReturnType<typeof nuovoDoc>>;

function scarica(doc: Doc, nome: string) {
  const url = URL.createObjectURL(new Blob([doc.output("arraybuffer")], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Intestazione del documento; ritorna la y da cui continuare. */
function intestazione(doc: Doc, titolo: string, sottotitolo: string | null, h: IntestazioneContabilita): number {
  const W = doc.internal.pageSize.getWidth(); const m = 36;
  let y = m;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  const righe = [
    h.stazioneAppaltante && `Stazione appaltante: ${h.stazioneAppaltante}`,
    `Lavori: ${h.lavori}`,
    [h.cig && `CIG ${h.cig}`, h.cup && `CUP ${h.cup}`].filter(Boolean).join(" · "),
    h.impresa && `Impresa: ${h.impresa}`,
    h.contratto && `Contratto: ${h.contratto}`,
    [h.direttoreLavori && `Direttore dei lavori: ${h.direttoreLavori}`, h.rup && `RUP: ${h.rup}`].filter(Boolean).join(" · "),
  ].filter((r): r is string => !!r);
  for (const r of righe) { for (const l of doc.splitTextToSize(r, W - 2 * m) as string[]) { doc.text(l, m, y); y += 10; } }
  y += 8;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(titolo, W / 2, y, { align: "center" }); y += 14;
  if (sottotitolo) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(sottotitolo, W / 2, y, { align: "center" }); y += 12; }
  return y + 6;
}

/** Tabella con intestazione ripetuta a ogni pagina e testo a capo nelle colonne larghe. */
function tabella(doc: Doc, y0: number, colonne: Colonna[], righe: Cella[][], fontSize = 7.5): number {
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const m = 36;
  const totale = colonne.reduce((s, c) => s + c.larghezza, 0);
  const scala = (W - 2 * m) / totale;
  const xs: number[] = []; let x = m;
  for (const c of colonne) { xs.push(x); x += c.larghezza * scala; }
  const testata = (yy: number) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(fontSize);
    colonne.forEach((c, i) => {
      const w = c.larghezza * scala;
      const linee = doc.splitTextToSize(c.titolo, w - 4) as string[];
      linee.forEach((l, k) => doc.text(l, c.allinea === "right" ? xs[i] + w - 2 : xs[i] + 2, yy + k * (fontSize + 1), { align: c.allinea === "right" ? "right" : "left" }));
    });
    const alt = Math.max(...colonne.map((c) => (doc.splitTextToSize(c.titolo, c.larghezza * scala - 4) as string[]).length)) * (fontSize + 1);
    doc.setLineWidth(0.5); doc.line(m, yy + alt - fontSize + 2, W - m, yy + alt - fontSize + 2);
    return yy + alt + 4;
  };
  let y = testata(y0);
  for (const riga of righe) {
    const celle = riga.map((c) => (typeof c === "string" ? { testo: c } : c));
    const linee = celle.map((c, i) => doc.splitTextToSize(c.testo ?? "", colonne[i].larghezza * scala - 4) as string[]);
    const alt = Math.max(1, ...linee.map((l) => l.length)) * (fontSize + 1.5) + 2;
    if (y + alt > H - m) { doc.addPage(); y = testata(m + 10); }
    celle.forEach((c, i) => {
      doc.setFont("helvetica", c.grassetto ? "bold" : c.corsivo ? "italic" : "normal"); doc.setFontSize(fontSize);
      const w = colonne[i].larghezza * scala;
      linee[i].forEach((l, k) => doc.text(l, colonne[i].allinea === "right" ? xs[i] + w - 2 : xs[i] + 2, y + k * (fontSize + 1.5), { align: colonne[i].allinea === "right" ? "right" : "left" }));
    });
    y += alt;
  }
  return y;
}

/** Elenco di voci «etichetta … importo», con la riga finale in grassetto. */
function prospetto(doc: Doc, y0: number, righe: Array<[string, string, boolean?]>): number {
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const m = 36;
  let y = y0;
  doc.setFontSize(9);
  for (const [etichetta, valore, grassetto] of righe) {
    if (y > H - m - 20) { doc.addPage(); y = m + 10; }
    doc.setFont("helvetica", grassetto ? "bold" : "normal");
    const linee = doc.splitTextToSize(etichetta, W - 2 * m - 120) as string[];
    linee.forEach((l, k) => doc.text(l, m, y + k * 11));
    doc.text(valore, W - m, y + (linee.length - 1) * 11, { align: "right" });
    if (grassetto) { doc.setLineWidth(0.3); doc.line(W - m - 110, y - 9, W - m, y - 9); }
    y += linee.length * 11 + 3;
  }
  return y;
}

function firme(doc: Doc, y0: number, chi: string[]) {
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const m = 36;
  let y = y0 + 24;
  if (y > H - m - 50) { doc.addPage(); y = m + 30; }
  const passo = (W - 2 * m) / chi.length;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  chi.forEach((c, i) => {
    const x = m + i * passo + passo / 2;
    doc.text(c, x, y, { align: "center" });
    doc.line(x - passo / 2 + 14, y + 30, x + passo / 2 - 14, y + 30);
  });
}

function pieDiPagina(doc: Doc, testo: string) {
  const n = doc.getNumberOfPages(); const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(`${testo} · pag. ${i} di ${n}`, W / 2, H - 18, { align: "center" });
  }
}

// ── Elenco prezzi ────────────────────────────────────────────────────────────

export async function stampaElencoPrezzi(righe: RigaElencoPrezzi[], h: IntestazioneContabilita) {
  const doc = await nuovoDoc(false);
  const y = intestazione(doc, "ELENCO PREZZI UNITARI", h.ribasso != null ? `Ribasso d'asta ${pct(h.ribasso)}% (gli oneri della sicurezza non sono soggetti a ribasso)` : null, h);
  tabella(doc, y, [
    { titolo: "N.", larghezza: 30 }, { titolo: "Tariffa", larghezza: 60 }, { titolo: "Descrizione", larghezza: 250 },
    { titolo: "U.M.", larghezza: 30 }, { titolo: "Prezzo €", larghezza: 55, allinea: "right" }, { titolo: "Prezzo ribassato €", larghezza: 60, allinea: "right" },
  ], righe.map((r) => [r.numero, r.tariffa, `${r.nuovo_prezzo ? "[NP] " : ""}${r.is_sicurezza ? "[Sicurezza] " : ""}${r.descrizione}`, r.unita_misura,
    euro(r.prezzo), euro(r.prezzo_ribassato)]));
  pieDiPagina(doc, "Elenco prezzi");
  scarica(doc, nomeFileComputo(`Elenco prezzi ${h.lavori}`, "pdf"));
}

// ── Libretto delle misure ────────────────────────────────────────────────────

export interface RigaStampaLibretto {
  numero: number; data: string; voce: string; tariffa: string; descrizione: string; unita_misura: string;
  righe: RigaMisura[]; quantita: number; annotazioni: string | null; firmatario: string | null; firmato: boolean;
  progressivo: ProgressivoRegistrazione | undefined; sal: number | null;
}

export async function stampaLibretto(righe: RigaStampaLibretto[], h: IntestazioneContabilita) {
  const doc = await nuovoDoc(true);
  const y = intestazione(doc, "LIBRETTO DELLE MISURE", null, h);
  const corpo: Cella[][] = [];
  for (const r of righe) {
    corpo.push([{ testo: String(r.numero), grassetto: true }, dataIt(r.data), { testo: `${r.voce} ${r.tariffa}`.trim(), grassetto: true },
      { testo: r.descrizione.slice(0, 400), grassetto: true }, "", "", "", "", "", "", ""]);
    for (const m of r.righe) {
      corpo.push(["", "", "", { testo: m.descrizione ?? "", corsivo: true }, q(m.parti_uguali ?? null), q(m.lunghezza ?? null), q(m.larghezza ?? null),
        q(m.altezza_peso ?? null), q(quantitaRiga(m), 3), "", ""]);
    }
    corpo.push(["", "", "", { testo: [r.annotazioni, r.firmatario && `${r.firmato ? "Firmato" : "Da firmare"}: ${r.firmatario}`, r.sal && `Contabilizzata nel SAL n. ${r.sal}`].filter(Boolean).join(" · "), corsivo: true },
      "", "", "", { testo: r.unita_misura, grassetto: true }, { testo: q(r.quantita, 3), grassetto: true }, q(r.progressivo?.progressivo ?? null, 3),
      r.progressivo?.eccedenza ? `+${q(r.progressivo.eccedenza, 3)} oltre il contratto` : ""]);
  }
  tabella(doc, y, [
    { titolo: "N.", larghezza: 26 }, { titolo: "Data", larghezza: 48 }, { titolo: "Voce", larghezza: 60 }, { titolo: "Designazione e misure", larghezza: 270 },
    { titolo: "par.ug.", larghezza: 40, allinea: "right" }, { titolo: "lung.", larghezza: 40, allinea: "right" }, { titolo: "larg.", larghezza: 40, allinea: "right" },
    { titolo: "H/peso", larghezza: 40, allinea: "right" }, { titolo: "Quantità", larghezza: 52, allinea: "right" }, { titolo: "Progressivo voce", larghezza: 56, allinea: "right" },
    { titolo: "Note", larghezza: 70 },
  ], corpo);
  pieDiPagina(doc, "Libretto delle misure");
  scarica(doc, nomeFileComputo(`Libretto misure ${h.lavori}`, "pdf"));
}

// ── Registro di contabilità ──────────────────────────────────────────────────

export async function stampaRegistro(reg: Registro, finoAl: string | null, h: IntestazioneContabilita) {
  const doc = await nuovoDoc(true);
  let y = intestazione(doc, "REGISTRO DI CONTABILITÀ", finoAl ? `Lavori a tutto il ${dataIt(finoAl)}` : null, h);
  y = tabella(doc, y, [
    { titolo: "N.", larghezza: 28 }, { titolo: "Tariffa", larghezza: 60 }, { titolo: "Descrizione", larghezza: 260 }, { titolo: "U.M.", larghezza: 30 },
    { titolo: "Q.tà contratto", larghezza: 55, allinea: "right" }, { titolo: "Q.tà registrata", larghezza: 55, allinea: "right" }, { titolo: "%", larghezza: 35, allinea: "right" },
    { titolo: "Prezzo €", larghezza: 55, allinea: "right" }, { titolo: "Importo €", larghezza: 65, allinea: "right" },
  ], reg.righe.filter((r) => r.quantita !== 0).map((r) => [r.numero, r.tariffa, `${r.is_sicurezza ? "[Sicurezza] " : ""}${r.descrizione.slice(0, 300)}`, r.unita_misura,
    q(r.quantita_contratto, 3), q(r.quantita, 3), q(r.percentuale_eseguita), euro(r.prezzo), euro(r.importo_lordo)]));
  prospetto(doc, y + 10, righeRegistro(reg));
  pieDiPagina(doc, "Registro di contabilità");
  scarica(doc, nomeFileComputo(`Registro contabilita ${h.lavori}`, "pdf"));
}

function righeRegistro(reg: Registro): Array<[string, string, boolean?]> {
  return [
    ["Lavori a misura e a corpo ai prezzi di contratto (sicurezza esclusa)", euro(reg.lavori_lordo)],
    [`A dedurre ribasso d'asta del ${pct(reg.ribasso_percentuale)}%`, `− ${euro(reg.ribasso)}`],
    ["Lavori al netto del ribasso", euro(reg.lavori_netti)],
    [`Oneri della sicurezza ${reg.sicurezza_modo === "a_misura" ? "(a misura)" : "(in proporzione ai lavori eseguiti)"}, non soggetti a ribasso`, euro(reg.sicurezza)],
    ["Importo complessivo dei lavori eseguiti", euro(reg.totale), true],
  ];
}

// ── Stato d'avanzamento lavori ───────────────────────────────────────────────

export interface VoceStampaSal {
  numero: string | null; tariffa: string | null; descrizione: string | null; unita_misura: string | null; is_sicurezza: boolean;
  prezzo: number; quantita_precedente: number; quantita_a_oggi: number; importo_a_oggi: number;
}

export function righeSal(s: CalcoloSal, sicurezzaModo: string, ribassoP: number): Array<[string, string, boolean?]> {
  return [
    ["Lavori a misura e a corpo eseguiti a tutto oggi, ai prezzi di contratto", euro(s.lavori_lordo)],
    [`A dedurre ribasso d'asta del ${pct(ribassoP)}%`, `− ${euro(s.ribasso)}`],
    ["Importo netto dei lavori", euro(s.lavori_netti)],
    [`Oneri della sicurezza ${sicurezzaModo === "a_misura" ? "(a misura)" : "(in proporzione)"}, non soggetti a ribasso`, euro(s.sicurezza)],
    ["IMPORTO COMPLESSIVO DEI LAVORI A TUTTO OGGI", euro(s.totale_a_oggi), true],
    [`A dedurre ritenuta di garanzia dello ${pct(s.ritenuta_percentuale)}%`, `− ${euro(s.ritenuta)}`],
    ...(s.anticipazione_percentuale ? [[`A dedurre recupero dell'anticipazione (${pct(s.anticipazione_percentuale)}% su ${euro(s.anticipazione)} €)`, `− ${euro(s.recupero_anticipazione)}`] as [string, string]] : []),
    ["Importo netto a tutto oggi", euro(s.netto_a_oggi)],
    ["A dedurre l'importo degli stati d'avanzamento precedenti", `− ${euro(s.sal_precedenti)}`],
    ["IMPORTO DEL PRESENTE STATO D'AVANZAMENTO", euro(s.importo_sal), true],
  ];
}

export async function stampaSal(sal: CalcoloSal & { numero: number; data: string; lavori_a_tutto: string; sicurezza_modo: string; ribasso_percentuale: number; stato: string },
  voci: VoceStampaSal[], h: IntestazioneContabilita) {
  const doc = await nuovoDoc(true);
  let y = intestazione(doc, `STATO D'AVANZAMENTO LAVORI N. ${sal.numero}`,
    `Lavori a tutto il ${dataIt(sal.lavori_a_tutto)} · redatto il ${dataIt(sal.data)}${sal.stato === "approvato" ? "" : " · BOZZA"}`, h);
  y = tabella(doc, y, [
    { titolo: "N.", larghezza: 28 }, { titolo: "Tariffa", larghezza: 60 }, { titolo: "Descrizione", larghezza: 250 }, { titolo: "U.M.", larghezza: 30 },
    { titolo: "Q.tà precedente", larghezza: 55, allinea: "right" }, { titolo: "Q.tà del periodo", larghezza: 55, allinea: "right" },
    { titolo: "Q.tà a tutto oggi", larghezza: 55, allinea: "right" }, { titolo: "Prezzo €", larghezza: 55, allinea: "right" }, { titolo: "Importo a tutto oggi €", larghezza: 70, allinea: "right" },
  ], voci.map((v) => [v.numero ?? "", v.tariffa ?? "", `${v.is_sicurezza ? "[Sicurezza] " : ""}${(v.descrizione ?? "").slice(0, 300)}`, v.unita_misura ?? "",
    q(v.quantita_precedente, 3), q(v.quantita_a_oggi - v.quantita_precedente, 3), q(v.quantita_a_oggi, 3), euro(v.prezzo), euro(v.importo_a_oggi)]));
  y = prospetto(doc, y + 12, righeSal(sal, sal.sicurezza_modo, sal.ribasso_percentuale));
  firme(doc, y, ["Il Direttore dei lavori", "L'Impresa", "Il Responsabile unico del progetto"]);
  pieDiPagina(doc, `SAL n. ${sal.numero}`);
  scarica(doc, nomeFileComputo(`SAL ${sal.numero} ${h.lavori}`, "pdf"));
}

// ── Certificato di pagamento ────────────────────────────────────────────────

export async function stampaCertificato(c: CertificatoPagamento & { numero: number; data: string; salNumero: number; lavoriATutto: string },
  sal: CalcoloSal, h: IntestazioneContabilita) {
  const doc = await nuovoDoc(false);
  let y = intestazione(doc, `CERTIFICATO DI PAGAMENTO N. ${c.numero}`, `relativo allo stato d'avanzamento lavori n. ${c.salNumero} (lavori a tutto il ${dataIt(c.lavoriATutto)}) · ${dataIt(c.data)}`, h);
  y = prospetto(doc, y, [
    ["Importo complessivo dei lavori a tutto oggi", euro(sal.totale_a_oggi)],
    [`A dedurre ritenuta di garanzia dello ${pct(sal.ritenuta_percentuale)}%`, `− ${euro(sal.ritenuta)}`],
    ...(sal.anticipazione_percentuale ? [["A dedurre recupero dell'anticipazione", `− ${euro(sal.recupero_anticipazione)}`] as [string, string]] : []),
    ["A dedurre certificati precedenti", `− ${euro(sal.sal_precedenti)}`],
    ["Importo del presente certificato (imponibile)", euro(c.imponibile), true],
    [`IVA ${pct(c.aliquota_iva)}%`, euro(c.iva)],
    ["Totale", euro(c.totale), true],
  ]);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const W = doc.internal.pageSize.getWidth();
  const testo = c.split_payment
    ? `Scissione dei pagamenti (art. 17-ter D.P.R. 633/1972): la stazione appaltante paga all'impresa l'imponibile di ${euro(c.da_pagare_impresa)} € e versa l'IVA di ${euro(c.iva)} € direttamente all'Erario.`
    : `Si certifica che all'impresa può essere pagata la somma di ${euro(c.da_pagare_impresa)} €, IVA compresa.`;
  const linee = doc.splitTextToSize(testo, W - 72) as string[];
  linee.forEach((l, k) => doc.text(l, 36, y + 8 + k * 11));
  y += 8 + linee.length * 11;
  firme(doc, y, ["Il Responsabile unico del progetto", "Il Direttore dei lavori"]);
  pieDiPagina(doc, `Certificato di pagamento n. ${c.numero}`);
  scarica(doc, nomeFileComputo(`Certificato pagamento ${c.numero} ${h.lavori}`, "pdf"));
}

// ── Perizia di variante: quadro di confronto ────────────────────────────────

export async function stampaConfrontoVariante(c: ConfrontoVariante, titolo: string, h: IntestazioneContabilita) {
  const doc = await nuovoDoc(true);
  let y = intestazione(doc, "PERIZIA DI VARIANTE · QUADRO DI CONFRONTO", titolo, h);
  y = tabella(doc, y, [
    { titolo: "N.", larghezza: 30 }, { titolo: "Descrizione", larghezza: 220 }, { titolo: "U.M.", larghezza: 28 },
    { titolo: "Q.tà contratto", larghezza: 55, allinea: "right" }, { titolo: "Prezzo contratto", larghezza: 55, allinea: "right" }, { titolo: "Importo contratto", larghezza: 65, allinea: "right" },
    { titolo: "Q.tà variante", larghezza: 55, allinea: "right" }, { titolo: "Prezzo variante", larghezza: 55, allinea: "right" }, { titolo: "Importo variante", larghezza: 65, allinea: "right" },
    { titolo: "Differenza", larghezza: 65, allinea: "right" },
  ], c.righe.filter((r) => r.esito !== "invariata").map((r) => [r.numero, `${r.nuovo_prezzo ? "[NP] " : ""}${r.descrizione.slice(0, 250)}`, r.unita_misura,
    q(r.quantita_contratto, 3), euro(r.prezzo_contratto), euro(r.importo_contratto), q(r.quantita_variante, 3), euro(r.prezzo_variante), euro(r.importo_variante),
    euro(r.differenza)]));
  y = prospetto(doc, y + 12, [
    ["Lavori del contratto (sicurezza esclusa)", euro(c.contratto.lavori)],
    ["Lavori della variante (sicurezza esclusa)", euro(c.variante.lavori)],
    ["Oneri della sicurezza: contratto / variante", `${euro(c.contratto.sicurezza)} / ${euro(c.variante.sicurezza)}`],
    ["Importo contrattuale (al netto del ribasso, sicurezza compresa)", euro(c.contratto.importo_contrattuale)],
    ["Importo dopo la variante", euro(c.variante.importo_contrattuale), true],
    [`Maggiore (+) o minore (−) importo: ${c.percentuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%${c.oltre_quinto ? " — oltre il quinto d'obbligo" : ""}`, euro(c.differenza), true],
  ]);
  firme(doc, y, ["Il Direttore dei lavori", "L'Impresa", "Il Responsabile unico del progetto"]);
  pieDiPagina(doc, "Perizia di variante");
  scarica(doc, nomeFileComputo(`Variante ${titolo}`, "pdf"));
}
