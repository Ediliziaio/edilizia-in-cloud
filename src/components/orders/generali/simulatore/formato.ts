// src/components/orders/generali/simulatore/formato.ts
// Come si scrivono i numeri del simulatore: gli stessi formati del piano economico.
import { euro, euroSegno, percento } from "@/components/orders/generali/piano/formato";
import type { FormatoMetrica } from "@/lib/orders/generali/simulatore";

/** 0,052 → «+5,2 punti». */
export const punti = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : "−"}${(Math.abs(n) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} punti`;

export function formatta(n: number | null | undefined, formato: FormatoMetrica): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  switch (formato) {
    case "euro": return euro(n);
    case "euroMq": return `${euro(n)}/m²`;
    case "percento": return percento(n);
    case "punti": return punti(n);
    case "mesi": return `${n} mesi`;
    default: return n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
  }
}

/** La differenza dalla prima ipotesi, col segno. */
export function formattaDifferenza(n: number | null, formato: FormatoMetrica): string {
  if (n === null || !Number.isFinite(n)) return "";
  switch (formato) {
    case "euro": return euroSegno(n);
    case "euroMq": return `${euroSegno(n)}/m²`;
    case "percento":
    case "punti": return punti(n);
    case "mesi": return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} mesi`;
    default: return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("it-IT", { maximumFractionDigits: 2 })}`;
  }
}
