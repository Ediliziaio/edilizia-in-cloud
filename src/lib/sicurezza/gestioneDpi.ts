import { TIPI_DPI, type ConsegnaDpi } from "./dpiCommessa";
export const STATI_DPI = {
  in_use: "In uso",
  damaged: "Danneggiato",
  lost: "Smarrito",
  returned: "Restituito",
  expired: "Scaduto",
} as const;
export interface DatiConsegnaDpi {
  evidenza_impronta?: string | null;
  evidenza_id?: string | null;
  evidenza_attesa?: string | null;
  tipo: string;
  marca: string;
  taglia: string;
  matricola: string;
  consegnato_il: string;
  scade_il: string;
  stato: string;
  restituito_il: string;
  note: string;
  annullata: boolean;
  motivo: string;
}
export interface EventoDpi {
  id: string;
  company_id: string;
  employee_id?: string;
  operaio_id?: string;
  consegna_id: string;
  versione: number;
  operazione: "creata" | "rettificata" | "eliminata";
  prima: ConsegnaDpi | null;
  dopo: ConsegnaDpi | null;
  motivo: string;
  registrato_da: string | null;
  registrato_il: string;
}
export function datiConsegna(d?: ConsegnaDpi): DatiConsegnaDpi {
  return {
    tipo: d?.tipo ?? "",
    marca: d?.marca ?? "",
    taglia: d?.taglia ?? "",
    matricola: d?.matricola ?? "",
    consegnato_il:
      d?.consegnato_il ??
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(
        new Date(),
      ),
    scade_il: d?.scade_il ?? "",
    stato: d?.stato ?? "in_use",
    restituito_il: d?.restituito_il ?? "",
    note: d?.note ?? "",
    annullata: d?.annullata ?? false,
    motivo: "",
  };
}
const valida = (s: string) =>
  !s.startsWith("0000-") &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function erroriConsegnaDpi(d: DatiConsegnaDpi): string[] {
  const e: string[] = [];
  if (!Object.hasOwn(TIPI_DPI, d.tipo)) e.push("Scegli il tipo DPI.");
  if (!Object.hasOwn(STATI_DPI, d.stato))
    e.push("Scegli lo stato del dispositivo.");
  if (!valida(d.consegnato_il)) e.push("Indica una data di consegna valida.");
  for (const [titolo, v] of [
    ["scadenza", d.scade_il],
    ["restituzione", d.restituito_il],
  ])
    if (v && (!valida(v) || v < d.consegnato_il))
      e.push(
        `La data di ${titolo} deve essere valida e non precedere la consegna.`,
      );
  if (d.stato === "returned" && !d.restituito_il)
    e.push("Indica la data di restituzione.");
  if (d.motivo.trim().length < 3 || d.motivo.length > 2000)
    e.push(
      "Indica il motivo della registrazione o rettifica (3–2000 caratteri).",
    );
  if (
    d.note.length > 2000 ||
    [d.marca, d.taglia, d.matricola].some((v) => v.length > 200)
  )
    e.push("Riduci le note o i dati identificativi del dispositivo.");
  return e;
}
