import type { RigaDaRivedere } from "@/lib/importazione/tipi";

/**
 * Le righe non importate, come erano nel file, con il motivo in una colonna in più:
 * si correggono in Excel e si reimportano. Punto e virgola e BOM, così Excel le apre
 * in colonne e con le lettere accentate giuste.
 */
/** `numeri[i]` è il numero nel file della riga `righeFile[i]`; senza, la riga i è la i+2 (dopo l'intestazione). */
export function csvRigheDaRivedere(intestazioni: string[], righeFile: string[][], daRivedere: RigaDaRivedere[], numeri?: number[]): string {
  const cella = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const perNumero = new Map<number, string[]>(righeFile.map((r, i) => [numeri?.[i] ?? i + 2, r]));
  const motivi = new Map<number, string[]>();
  for (const r of daRivedere) motivi.set(r.riga, [...(motivi.get(r.riga) ?? []), r.motivo]);
  const righe = [...motivi.keys()].sort((a, b) => a - b).flatMap((n) => {
    const originale = perNumero.get(n);
    if (!originale) return [];
    return [[...intestazioni.map((_, i) => originale[i] ?? ""), motivi.get(n)!.join("; ")].map(cella).join(";")];
  });
  return "﻿" + [[...intestazioni, "Motivo"].map(cella).join(";"), ...righe].join("\r\n");
}

export function scaricaRigheDaRivedere(nomeFile: string, intestazioni: string[], righeFile: string[][], daRivedere: RigaDaRivedere[], numeri?: number[]) {
  const blob = new Blob([csvRigheDaRivedere(intestazioni, righeFile, daRivedere, numeri)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeFile.replace(/\.[^.]+$/, "")} - righe da correggere.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** L'errore del database detto in parole semplici: chi importa non deve leggere messaggi tecnici. */
export function motivoLeggibile(esito: string | null): string {
  const e = (esito ?? "").toLowerCase();
  if (e.includes("duplicate key")) return "c'è già un elemento uguale";
  if (e.includes("invalid input syntax") || e.includes("out of range")) return "un valore non è scritto nel formato giusto (per esempio un numero o una data)";
  if (e.includes("value too long")) return "un testo è troppo lungo";
  if (e.includes("not-null") || e.includes("null value")) return "manca un dato obbligatorio";
  if (e.includes("foreign key")) return "un dato collegato non esiste più (per esempio un campo personalizzato cancellato)";
  if (e.includes("check constraint")) return "un valore non è tra quelli ammessi";
  return "non è entrata per un errore: controlla i dati della riga";
}

export interface RigaProgrammataFallita {
  ordine: number;
  esito: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dati: any;
}

/** Le righe andate male di un'importazione a scaglioni: i dati letti dal file più il motivo. */
export function csvRigheProgrammate(oggetto: "contatti" | "opportunita", righe: RigaProgrammataFallita[]): string {
  const cella = (v: unknown) => {
    const t = v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const contatto = ["Nome", "Cognome", "Email", "Telefono", "Azienda", "Città", "Provincia"];
  const intestazioni = oggetto === "contatti"
    ? ["Riga del file", ...contatto, "Etichette", "Note", "Motivo"]
    : ["Riga del file", "Opportunità", "Valore", "Etichette", "Note", ...contatto.map((c) => `${c} contatto`), "Motivo"];
  const corpo = [...righe].sort((a, b) => (a.dati?.riga ?? a.ordine) - (b.dati?.riga ?? b.ordine)).map((r) => {
    const c = r.dati?.contatto ?? {};
    const dc = [c.first_name, c.last_name, c.email, c.phone, c.company_name, c.city, c.province];
    const o = r.dati?.opportunita ?? {};
    const valori = oggetto === "contatti"
      ? [r.dati?.riga ?? "", ...dc, c.tags, c.notes, motivoLeggibile(r.esito)]
      : [r.dati?.riga ?? "", o.name, o.value, o.tags, o.notes, ...dc, motivoLeggibile(r.esito)];
    return valori.map(cella).join(";");
  });
  return "﻿" + [intestazioni.map(cella).join(";"), ...corpo].join("\r\n");
}

export function scaricaCsv(nomeFile: string, contenuto: string) {
  const blob = new Blob([contenuto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
