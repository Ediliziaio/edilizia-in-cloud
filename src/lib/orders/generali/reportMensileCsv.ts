import { escapeCsvCell } from "@/lib/csvExport";

export function csvReportMensile(righe: (string | number | null | undefined)[][]): string {
  const cella = (valore: string | number | null | undefined) =>
    typeof valore === "number" && Number.isFinite(valore)
      ? valore.toLocaleString("it-IT", { useGrouping: false, maximumFractionDigits: 2 })
      : escapeCsvCell(valore ?? "");
  return "\ufeff" + righe.map((r) => r.map(cella).join(";")).join("\r\n");
}
