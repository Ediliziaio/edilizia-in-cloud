// Esportazione delle timbrature (01/10/2026): Excel con riepilogo ore, totali per
// persona e il dettaglio, anche diviso per reparto / ruolo / dipendente; oppure CSV.
import { exportToCSV, neutralizeCsvFormula } from "@/lib/csvExport";
import {
  chiaveGruppo, nomeFoglio, nomePersona, oreMinuti, riepilogoGiornaliero, tipoNormalizzato,
  type Raggruppa, type RigaTimbratura,
} from "./timbrature";

export const ETICHETTA_TIPO: Record<string, string> = {
  entrata: "Entrata",
  uscita: "Uscita",
  pausa_inizio: "Inizio pausa",
  pausa_fine: "Fine pausa",
};
const etichettaTipo = (tipo: string) => ETICHETTA_TIPO[tipoNormalizzato(tipo)] ?? tipo;

const dataIt = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

export function nomeFileTimbrature(da: string, a: string, estensione: "xlsx" | "csv"): string {
  return `timbrature_${da}${a !== da ? `_${a}` : ""}.${estensione}`;
}

function scarica(buffer: ArrayBuffer, nomeFile: string) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const cella = (v: unknown) => (typeof v === "string" ? neutralizeCsvFormula(v) : v);

/** Excel: «Riepilogo ore», «Totali» per persona e il dettaglio (un foglio per gruppo se si divide). */
export async function esportaTimbratureXlsx(opts: { righe: RigaTimbratura[]; da: string; a: string; raggruppa: Raggruppa }): Promise<void> {
  const { righe, da, a, raggruppa } = opts;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const usati = new Set<string>();

  const aggiungi = (nome: string, colonne: { header: string; key: string; width: number }[], dati: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(nomeFoglio(nome, usati));
    ws.columns = colonne;
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const d of dati) ws.addRow(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, cella(v)])));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colonne.length } };
  };

  // 1. Riepilogo ore, per giorno e persona
  const giorni = riepilogoGiornaliero(righe);
  aggiungi("Riepilogo ore", [
    { header: "Data", key: "data", width: 12 }, { header: "Dipendente", key: "persona", width: 26 },
    { header: "Reparto", key: "reparto", width: 18 }, { header: "Ruolo", key: "mansione", width: 20 },
    { header: "Entrata", key: "entrata", width: 9 }, { header: "Uscita", key: "uscita", width: 9 },
    { header: "Pausa (h:mm)", key: "pausa", width: 12 }, { header: "Ore lavorate (h:mm)", key: "ore", width: 18 },
    { header: "Timbrature", key: "n", width: 11 }, { header: "Da controllare", key: "anomalia", width: 28 },
  ], giorni.map((g) => ({
    data: dataIt(g.data), persona: g.persona, reparto: g.reparto, mansione: g.mansione,
    entrata: g.entrata ?? "", uscita: g.uscita ?? "", pausa: oreMinuti(g.pausaMin), ore: oreMinuti(g.lavoratiMin),
    n: g.timbrature, anomalia: g.anomalia,
  })));

  // 2. Totali per persona (solo giornate regolari: una giornata incompleta non si somma a caso)
  const perPersona = new Map<string, { persona: string; reparto: string; mansione: string; giorni: number; min: number; incomplete: number }>();
  for (const g of giorni) {
    const x = perPersona.get(g.profilo_id) ?? { persona: g.persona, reparto: g.reparto, mansione: g.mansione, giorni: 0, min: 0, incomplete: 0 };
    x.giorni += 1;
    if (g.lavoratiMin === null) x.incomplete += 1; else x.min += g.lavoratiMin;
    perPersona.set(g.profilo_id, x);
  }
  aggiungi("Totali", [
    { header: "Dipendente", key: "persona", width: 26 }, { header: "Reparto", key: "reparto", width: 18 },
    { header: "Ruolo", key: "mansione", width: 20 }, { header: "Giorni con timbrature", key: "giorni", width: 20 },
    { header: "Ore lavorate (h:mm)", key: "ore", width: 18 }, { header: "Giornate da controllare", key: "incomplete", width: 22 },
  ], Array.from(perPersona.values()).sort((p, q) => p.persona.localeCompare(q.persona, "it")).map((p) => ({
    persona: p.persona, reparto: p.reparto, mansione: p.mansione, giorni: p.giorni, ore: oreMinuti(p.min), incomplete: p.incomplete,
  })));

  // 3. Dettaglio: un foglio solo, o uno per gruppo
  const colonneDettaglio = [
    { header: "Data", key: "data", width: 12 }, { header: "Ora", key: "ora", width: 8 },
    { header: "Dipendente", key: "persona", width: 26 }, { header: "Reparto", key: "reparto", width: 18 },
    { header: "Ruolo", key: "mansione", width: 20 }, { header: "Tipo", key: "tipo", width: 14 },
    { header: "Cantiere", key: "cantiere", width: 16 }, { header: "Fonte", key: "fonte", width: 12 },
    { header: "GPS", key: "gps", width: 6 }, { header: "Note", key: "note", width: 34 },
  ];
  const riga = (r: RigaTimbratura) => ({
    data: dataIt(r.data_evento), ora: (r.ora_evento ?? "").slice(0, 5), persona: nomePersona(r),
    reparto: r.reparto?.trim() || "(non indicato)", mansione: r.mansione?.trim() || "(non indicato)",
    tipo: etichettaTipo(r.tipo), cantiere: r.cantiere_codice ?? "", fonte: r.fonte ?? "",
    gps: r.lat != null && r.lng != null ? "sì" : "", note: r.note ?? "",
  });
  const ordinate = [...righe].sort((p, q) => p.data_evento.localeCompare(q.data_evento) || (p.ora_evento ?? "").localeCompare(q.ora_evento ?? ""));
  if (raggruppa === "nessuno") {
    aggiungi("Timbrature", colonneDettaglio, ordinate.map(riga));
  } else {
    const gruppi = new Map<string, RigaTimbratura[]>();
    for (const r of ordinate) {
      const k = chiaveGruppo(r, raggruppa);
      (gruppi.get(k) ?? gruppi.set(k, []).get(k)!).push(r);
    }
    for (const [k, v] of Array.from(gruppi.entries()).sort((p, q) => p[0].localeCompare(q[0], "it"))) {
      aggiungi(k, colonneDettaglio, v.map(riga));
    }
  }

  scarica(await wb.xlsx.writeBuffer() as ArrayBuffer, nomeFileTimbrature(da, a, "xlsx"));
}

/** CSV piatto (un'unica tabella con reparto e ruolo, da filtrare altrove). */
export function esportaTimbratureCsv(opts: { righe: RigaTimbratura[]; da: string; a: string }): void {
  const { righe, da, a } = opts;
  const dati = [...righe]
    .sort((p, q) => p.data_evento.localeCompare(q.data_evento) || (p.ora_evento ?? "").localeCompare(q.ora_evento ?? ""))
    .map((r) => ({
      data: dataIt(r.data_evento), ora: (r.ora_evento ?? "").slice(0, 5), persona: nomePersona(r),
      reparto: r.reparto?.trim() || "", mansione: r.mansione?.trim() || "", tipo: etichettaTipo(r.tipo),
      cantiere: r.cantiere_codice ?? "", fonte: r.fonte ?? "", note: r.note ?? "",
    }));
  exportToCSV(dati, [
    { key: "data", label: "Data" }, { key: "ora", label: "Ora" }, { key: "persona", label: "Dipendente" },
    { key: "reparto", label: "Reparto" }, { key: "mansione", label: "Ruolo" }, { key: "tipo", label: "Tipo" },
    { key: "cantiere", label: "Cantiere" }, { key: "fonte", label: "Fonte" }, { key: "note", label: "Note" },
  ], nomeFileTimbrature(da, a, "csv"));
}
