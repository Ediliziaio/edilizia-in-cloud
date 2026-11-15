/**
 * Esportazione del Controllo di gestione: ogni sezione si legge dal database con le stesse
 * funzioni delle schede (cgRpc) e diventa una o più tabelle, che si scaricano in Excel (un
 * foglio per tabella), CSV (un file, o uno ZIP con un file per tabella), PDF (stampa del
 * browser) o JSON (i dati come arrivano dal database).
 *
 * Le sezioni senza un formato su misura si appiattiscono da sole: i valori diventano righe
 * «Voce / Valore», gli elenchi diventano tabelle. Così una voce nuova nel database finisce nel
 * file senza toccare questo codice.
 */
import { cgRpc, type CgRpcName } from "@/hooks/controlloGestione/cgRpc";
import type { SPResult } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { buildAttivo, buildPassivo } from "@/lib/controlloGestione/spRighe";

export type Cella = string | number | null;

export interface Tabella {
  titolo: string;
  colonne: string[];
  righe: Cella[][];
}

export interface SezioneEsportata {
  chiave: string;
  titolo: string;
  tabelle: Tabella[];
  dati: unknown;
  errore?: string;
}

export interface DefinizioneSezione {
  chiave: string;
  titolo: string;
  rpc: CgRpcName;
  args: (anno: number) => Record<string, unknown>;
  tabelle?: (dati: unknown, titolo: string) => Tabella[];
}

export type FormatoEsportazione = "xlsx" | "csv" | "pdf" | "json";

// ── Appiattimento ──────────────────────────────────────────────────────────

const ETICHETTE: Record<string, string> = {
  ce: "CE", sp: "SP", pfn: "PFN", dso: "DSO", dpo: "DPO", dio: "DIO", ebitda: "EBITDA", ebit: "EBIT",
  roe: "ROE", roi: "ROI", ros: "ROS", dscr: "DSCR", bep: "BEP", iva: "IVA", tfr: "TFR", ires: "IRES",
  irap: "IRAP", pct: "%", mlt: "oltre 12 mesi", id: "ID",
};

/** «debiti_fornitori» → «Debiti fornitori»; «meta.patrimonio.tfr_iniziale» → «Meta › Patrimonio › TFR iniziale». */
export function etichetta(percorso: string): string {
  return percorso
    .split(".")
    .filter(Boolean)
    .map((parte) => {
      const parole = parte.split("_").map((p) => ETICHETTE[p.toLowerCase()] ?? p);
      const testo = parole.join(" ").trim();
      return testo.charAt(0).toUpperCase() + testo.slice(1);
    })
    .join(" › ");
}

function cellaDa(v: unknown): Cella {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? "sì" : "no";
  // I numeri del database arrivano già come numeri; una stringa resta testo (codici come «06»).
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

const eOggetto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function tabellaDaElenco(titolo: string, elenco: Record<string, unknown>[]): Tabella {
  const chiavi: string[] = [];
  const righePiatte = elenco.map((el) => {
    const piatta: Record<string, unknown> = {};
    const scendi = (o: Record<string, unknown>, pref: string, livello: number) => {
      for (const [k, v] of Object.entries(o)) {
        const chiave = pref ? `${pref}.${k}` : k;
        if (eOggetto(v) && livello < 2) scendi(v, chiave, livello + 1);
        else piatta[chiave] = v;
      }
    };
    scendi(el, "", 0);
    for (const k of Object.keys(piatta)) if (!chiavi.includes(k)) chiavi.push(k);
    return piatta;
  });
  return {
    titolo,
    colonne: chiavi.map(etichetta),
    righe: righePiatte.map((r) => chiavi.map((k) => cellaDa(r[k]))),
  };
}

/** Qualsiasi risposta del database in tabelle: riepilogo dei valori più una tabella per elenco. */
export function appiattisci(dati: unknown, titolo: string): Tabella[] {
  const scalari: [string, Cella][] = [];
  const tabelle: Tabella[] = [];
  const visita = (v: unknown, percorso: string) => {
    if (Array.isArray(v)) {
      if (v.length === 0) return;
      if (v.every(eOggetto)) {
        tabelle.push(tabellaDaElenco(percorso ? `${titolo} · ${etichetta(percorso)}` : titolo, v));
      } else {
        scalari.push([percorso, v.map((x) => (eOggetto(x) || Array.isArray(x) ? JSON.stringify(x) : String(x))).join(", ")]);
      }
    } else if (eOggetto(v)) {
      for (const [k, figlio] of Object.entries(v)) visita(figlio, percorso ? `${percorso}.${k}` : k);
    } else {
      scalari.push([percorso || "valore", cellaDa(v)]);
    }
  };
  visita(dati, "");
  const riepilogo: Tabella[] = scalari.length
    ? [{ titolo: tabelle.length ? `${titolo} · riepilogo` : titolo, colonne: ["Voce", "Valore"], righe: scalari.map(([k, v]) => [etichetta(k), v]) }]
    : [];
  return [...riepilogo, ...tabelle];
}

// ── Sezioni con un formato su misura ───────────────────────────────────────

function tabelleCE(dati: unknown, titolo: string): Tabella[] {
  const d = dati as { voci?: { codice: string; label: string; valore: number; pct_pil?: number }[]; meta?: unknown };
  const voci: Tabella = {
    titolo,
    colonne: ["Codice", "Voce", "Importo (€)", "% sui ricavi"],
    righe: (d.voci ?? []).map((v) => [v.codice, v.label, cellaDa(v.valore), cellaDa(v.pct_pil ?? null)]),
  };
  return [voci, ...appiattisci(d.meta ?? {}, `${titolo} · note di calcolo`)];
}

function tabelleSP(dati: unknown, titolo: string): Tabella[] {
  const d = dati as SPResult;
  if (!d?.attivo || !d?.passivo) return appiattisci(dati, titolo);
  const righe = (rr: ReturnType<typeof buildAttivo>) =>
    rr.map((r) => [r.label, cellaDa(r.valore), r.livello === "voce" ? "" : r.livello === "subtot" ? "subtotale" : "totale", r.spiegazione ?? ""]);
  const colonne = ["Voce", "Importo (€)", "Livello", "Come si calcola"];
  return [
    { titolo: `${titolo} · impieghi`, colonne, righe: righe(buildAttivo(d.attivo)) },
    { titolo: `${titolo} · fonti`, colonne, righe: righe(buildPassivo(d.passivo)) },
    ...appiattisci({ quadratura: d.quadratura, meta: d.meta }, `${titolo} · quadratura e note`),
  ];
}

function tabelleVersamenti(dati: unknown, titolo: string): Tabella[] {
  const d = dati as { scadenze?: { scadenza: string; atteso: number; pagato_banca: number; pagato_f24: number; stato: string; voci?: { voce: string; importo: number; fonte: string }[] }[] };
  const scadenze = d.scadenze ?? [];
  return [
    {
      titolo,
      colonne: ["Scadenza", "Dovuto (€)", "Uscito dalla banca (€)", "F24 registrati pagati (€)", "Stato"],
      righe: scadenze.map((s) => [s.scadenza, cellaDa(s.atteso), cellaDa(s.pagato_banca), cellaDa(s.pagato_f24), s.stato.replace(/_/g, " ")]),
    },
    {
      titolo: `${titolo} · voci`,
      colonne: ["Scadenza", "Voce", "Importo (€)", "Fonte"],
      righe: scadenze.flatMap((s) => (s.voci ?? []).map((v) => [s.scadenza, v.voce, cellaDa(v.importo), v.fonte])),
    },
    ...appiattisci(Object.fromEntries(Object.entries(d).filter(([k]) => k !== "scadenze")), `${titolo} · riepilogo`),
  ];
}

export const SEZIONI: DefinizioneSezione[] = [
  { chiave: "ce", titolo: "Conto economico", rpc: "cg_get_ce_safe", args: (anno) => ({ p_anno: anno }), tabelle: tabelleCE },
  { chiave: "ce_mensile", titolo: "Conto economico mese per mese", rpc: "cg_get_ce_mensile", args: (anno) => ({ p_anno: anno }) },
  { chiave: "sp", titolo: "Stato patrimoniale", rpc: "cg_get_sp_safe", args: (anno) => ({ p_anno: anno }), tabelle: tabelleSP },
  { chiave: "pfn", titolo: "Posizione finanziaria netta", rpc: "cg_get_pfn_safe", args: (anno) => ({ p_anno: anno }) },
  { chiave: "aging_crediti", titolo: "Scadenzario crediti per anzianità", rpc: "cg_get_aging_safe", args: () => ({ p_direction: "in" }) },
  { chiave: "aging_debiti", titolo: "Scadenzario debiti per anzianità", rpc: "cg_get_aging_safe", args: () => ({ p_direction: "out" }) },
  { chiave: "indici", titolo: "Indici avanzati", rpc: "cg_get_indici_avanzati_safe", args: (anno) => ({ p_anno: anno }) },
  { chiave: "rating", titolo: "Rating bancario", rpc: "cg_get_rating_safe", args: (anno) => ({ p_anno: anno }) },
  { chiave: "bep", titolo: "Punto di pareggio", rpc: "cg_get_bep_safe", args: (anno) => ({ p_anno: anno }) },
  { chiave: "imposte", titolo: "Imposte stimate", rpc: "cg_get_imposte_dettaglio_safe", args: (anno) => ({ p_anno: anno }) },
  { chiave: "commesse", titolo: "Marginalità delle commesse", rpc: "cg_get_marginalita_commesse_safe", args: (anno) => ({ p_anno: anno, p_status_filter: null }) },
  { chiave: "lavori_in_corso", titolo: "Lavori in corso", rpc: "cg_lavori_in_corso", args: (anno) => ({ p_anno: anno }) },
  { chiave: "ricavi", titolo: "Provenienza dei ricavi", rpc: "cg_ricavi_provenienza", args: (anno) => ({ p_anno: anno, p_mese_da: 1, p_mese_a: 12 }) },
  { chiave: "versamenti", titolo: "Versamenti F24", rpc: "cg_get_versamenti_fiscali", args: (anno) => ({ p_anno: anno }), tabelle: tabelleVersamenti },
  { chiave: "controllo_dati", titolo: "Controllo dei dati", rpc: "cg_get_health_check_safe", args: (anno) => ({ p_anno: anno }) },
  { chiave: "riconciliazione", titolo: "Confronto col bilancio del commercialista", rpc: "cg_get_riconciliazione_safe", args: (anno) => ({ p_anno: anno }) },
];

/** Sezioni delle schede che chiedono il permesso «Saldi bancari e liquidità». */
export const SEZIONI_CON_SALDI = ["sp", "pfn", "aging_crediti", "aging_debiti", "indici", "rating", "versamenti", "controllo_dati", "riconciliazione"];

/** Legge le sezioni scelte; una sezione che non si legge resta nel file con il motivo. */
export async function caricaSezioni(chiavi: string[], anno: number): Promise<SezioneEsportata[]> {
  const scelte = SEZIONI.filter((s) => chiavi.includes(s.chiave));
  return Promise.all(scelte.map(async (s): Promise<SezioneEsportata> => {
    try {
      const { data, error } = await cgRpc(s.rpc, s.args(anno));
      if (error) throw new Error(error.message);
      const tabelle = (s.tabelle ?? appiattisci)(data ?? {}, s.titolo).filter((t) => t.righe.length > 0);
      return { chiave: s.chiave, titolo: s.titolo, tabelle, dati: data };
    } catch (e) {
      const errore = e instanceof Error ? e.message : String(e);
      const vuota: SezioneEsportata = { chiave: s.chiave, titolo: s.titolo, tabelle: [], dati: null, errore };
      return vuota;
    }
  }));
}

// ── Formati ────────────────────────────────────────────────────────────────

export interface Intestazione {
  azienda?: string | null;
  titolo: string;
  anno: number;
}

const generatoIl = () => new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

/** CSV per Excel italiano: punto e virgola, virgola decimale, niente formule. */
export function tabellaInCsv(t: Tabella): string {
  const cella = (v: Cella) => {
    if (v === null) return "";
    if (typeof v === "number") return String(v).replace(".", ",");
    const sicuro = /^[=+\-@]/.test(v) ? `'${v}` : v;
    return /[";\n\r]/.test(sicuro) ? `"${sicuro.replace(/"/g, '""')}"` : sicuro;
  };
  return [t.colonne.map(cella).join(";"), ...t.righe.map((r) => r.map(cella).join(";"))].join("\r\n");
}

/** Nome di foglio Excel valido e unico (31 caratteri, niente : \ / ? * [ ]). */
export function nomeFoglio(titolo: string, usati: Set<string>): string {
  const base = titolo.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Foglio";
  let nome = base;
  for (let i = 2; usati.has(nome.toLowerCase()); i++) nome = `${base.slice(0, 26)} ${i}`;
  usati.add(nome.toLowerCase());
  return nome;
}

export function nomeFile(intestazione: Intestazione, estensione: string): string {
  const base = intestazione.titolo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${base}_${intestazione.anno}.${estensione}`;
}

function scaricaBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function scaricaXlsx(sezioni: SezioneEsportata[], intestazione: Intestazione): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const { neutralizeXlsxCell } = await import("@/lib/csvExport");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Edilizia In Cloud";
  wb.created = new Date();
  wb.title = intestazione.titolo;
  const usati = new Set<string>();

  const indice = wb.addWorksheet(nomeFoglio("Indice", usati));
  indice.columns = [{ width: 48 }, { width: 70 }];
  indice.addRow([intestazione.azienda ?? ""]).font = { bold: true, size: 14 };
  indice.addRow([`${intestazione.titolo} · ${intestazione.anno}`]).font = { bold: true, size: 12 };
  indice.addRow([`Generato il ${generatoIl()}`]).font = { italic: true, color: { argb: "FF6B7280" } };
  indice.addRow([]);
  indice.addRow(["Sezione", "Fogli"]).font = { bold: true };

  for (const s of sezioni) {
    const fogli: string[] = [];
    for (const t of s.tabelle) {
      const nome = nomeFoglio(t.titolo, usati);
      fogli.push(nome);
      const ws = wb.addWorksheet(nome);
      ws.addRow([t.titolo]).font = { bold: true, size: 12 };
      ws.addRow([`${intestazione.azienda ?? ""} · ${intestazione.anno}`]).font = { italic: true, color: { argb: "FF6B7280" } };
      ws.addRow([]);
      const testata = ws.addRow(t.colonne);
      testata.font = { bold: true };
      testata.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } }; });
      for (const r of t.righe) {
        const riga = ws.addRow(r.map((v) => (typeof v === "string" ? neutralizeXlsxCell(v) : v)));
        riga.eachCell((c) => { if (typeof c.value === "number") c.numFmt = "#,##0.00"; });
      }
      ws.columns.forEach((col, i) => {
        const larghezza = Math.max(t.colonne[i]?.length ?? 10, ...t.righe.slice(0, 200).map((r) => String(r[i] ?? "").length));
        col.width = Math.min(Math.max(larghezza + 2, 10), 70);
      });
      ws.views = [{ state: "frozen", ySplit: 4 }];
    }
    indice.addRow([s.titolo, s.errore ? `Non disponibile: ${s.errore}` : fogli.join(", ") || "Nessun dato"]);
  }

  const buf = await wb.xlsx.writeBuffer();
  scaricaBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nomeFile(intestazione, "xlsx"));
}

export async function scaricaCsv(sezioni: SezioneEsportata[], intestazione: Intestazione): Promise<void> {
  const tabelle = sezioni.flatMap((s) => s.tabelle);
  const bom = "﻿";
  if (tabelle.length === 1) {
    scaricaBlob(new Blob([bom + tabellaInCsv(tabelle[0])], { type: "text/csv;charset=utf-8" }), nomeFile(intestazione, "csv"));
    return;
  }
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const usati = new Set<string>();
  tabelle.forEach((t, i) => {
    const nome = `${String(i + 1).padStart(2, "0")}_${nomeFoglio(t.titolo, usati).toLowerCase().replace(/[^a-z0-9]+/g, "_")}.csv`;
    zip.file(nome, bom + tabellaInCsv(t));
  });
  const errori = sezioni.filter((s) => s.errore).map((s) => `${s.titolo}: ${s.errore}`);
  if (errori.length) zip.file("sezioni_non_disponibili.txt", errori.join("\r\n"));
  scaricaBlob(await zip.generateAsync({ type: "blob" }), nomeFile(intestazione, "zip"));
}

export function scaricaJson(sezioni: SezioneEsportata[], intestazione: Intestazione): void {
  const contenuto = {
    azienda: intestazione.azienda ?? null,
    titolo: intestazione.titolo,
    anno: intestazione.anno,
    generato_il: new Date().toISOString(),
    sezioni: Object.fromEntries(sezioni.map((s) => [s.chiave, s.errore ? { errore: s.errore } : s.dati])),
  };
  scaricaBlob(new Blob([JSON.stringify(contenuto, null, 2)], { type: "application/json" }), nomeFile(intestazione, "json"));
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const numeroIt = (n: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Documento A4 da stampare o salvare in PDF, con tutte le tabelle. */
export function htmlEsportazione(sezioni: SezioneEsportata[], intestazione: Intestazione): string {
  const corpo = sezioni.map((s) => {
    const tabelle = s.errore
      ? `<p class="nota">Non disponibile: ${escapeHtml(s.errore)}</p>`
      : s.tabelle.length === 0
        ? `<p class="nota">Nessun dato.</p>`
        : s.tabelle.map((t) => `
          <h3>${escapeHtml(t.titolo)}</h3>
          <table>
            <thead><tr>${t.colonne.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
            <tbody>${t.righe.map((r) => `<tr>${r.map((v) => typeof v === "number"
              ? `<td class="n">${numeroIt(v)}</td>`
              : `<td>${escapeHtml(v ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>`).join("");
    return `<section><h2>${escapeHtml(s.titolo)}</h2>${tabelle}</section>`;
  }).join("");
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${escapeHtml(intestazione.titolo)} ${intestazione.anno}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 9pt; color: #111827; }
  header { border-bottom: 2px solid #111827; margin-bottom: 10px; padding-bottom: 6px; }
  header h1 { font-size: 15pt; margin: 0; }
  header p { margin: 2px 0 0; color: #6b7280; }
  section { page-break-inside: auto; margin-bottom: 14px; }
  section + section { page-break-before: always; }
  h2 { font-size: 12pt; margin: 0 0 6px; }
  h3 { font-size: 10pt; margin: 10px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 3px 4px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .nota { color: #6b7280; font-style: italic; }
</style></head><body>
<header><h1>${escapeHtml(intestazione.titolo)} · ${intestazione.anno}</h1>
<p>${escapeHtml(intestazione.azienda ?? "")}${intestazione.azienda ? " · " : ""}generato il ${escapeHtml(generatoIl())}</p></header>
${corpo}
</body></html>`;
}
