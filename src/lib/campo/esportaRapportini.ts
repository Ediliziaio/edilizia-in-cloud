/** L'Excel dei rapportini di una commessa: una riga per rapportino, una colonna per ogni campo proprio. */
import { neutralizeCsvFormula } from "@/lib/csvExport";
import { chiaveValore, leggiValori, valoreInTesto } from "../../../supabase/functions/_shared/moduliCantiere";

export interface RigaRapportino {
  data_lavoro: string;
  stato?: string | null;
  ore_lavorate?: number | null;
  descrizione_lavori?: string | null;
  autore?: { first_name?: string | null; last_name?: string | null } | null;
  campi_extra?: unknown;
}
type Cella = string | number;

const STATI: Record<string, string> = { inviato: "Da approvare", approvato: "Approvato", rifiutato: "Rimandato indietro", bozza: "Bozza" };
const dataIt = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const testo = (v: string | null | undefined) => neutralizeCsvFormula(v ?? "");

export function righeEsportazione(rapportini: RigaRapportino[]): { colonne: string[]; righe: Cella[][] } {
  // Una colonna per campo e fase, con il nome più recente: l'elenco arriva dal più recente al più vecchio.
  const colonneCampi = new Map<string, string>();
  for (const r of rapportini) {
    for (const v of leggiValori(r.campi_extra)) {
      const id = chiaveValore(v.chiave, v.phase_id);
      if (!colonneCampi.has(id)) colonneCampi.set(id, testo(`${v.etichetta}${v.fase_nome ? ` (${v.fase_nome})` : v.unita ? ` (${v.unita})` : ""}`));
    }
  }
  const idCampi = [...colonneCampi.keys()];
  const righe = rapportini.map((r) => {
    const valori = new Map(leggiValori(r.campi_extra).map((v) => [chiaveValore(v.chiave, v.phase_id), v]));
    return [
      dataIt(r.data_lavoro),
      testo([r.autore?.first_name, r.autore?.last_name].filter(Boolean).join(" ")),
      STATI[r.stato ?? ""] ?? "",
      Number(r.ore_lavorate) || 0,
      testo(r.descrizione_lavori),
      ...idCampi.map((id): Cella => {
        const v = valori.get(id);
        if (!v) return "";
        return typeof v.valore === "number" ? v.valore : testo(valoreInTesto(v));
      }),
    ];
  });
  return { colonne: ["Data", "Autore", "Stato", "Ore", "Descrizione", ...colonneCampi.values()], righe };
}

export async function esportaRapportini(rapportini: RigaRapportino[], nomeFile: string): Promise<void> {
  const { colonne, righe } = righeEsportazione(rapportini);
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const foglio = libro.addWorksheet("Rapportini");
  foglio.addRow(colonne).font = { bold: true };
  righe.forEach((r) => foglio.addRow(r));
  colonne.forEach((c, i) => { foglio.getColumn(i + 1).width = c === "Descrizione" ? 60 : Math.max(12, Math.min(30, c.length + 2)); });
  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
