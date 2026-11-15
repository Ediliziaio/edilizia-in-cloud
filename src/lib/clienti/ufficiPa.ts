// Uffici di fatturazione di un cliente PA (lotto 2, 15/11/2026).
// Tabella anagrafica_uffici_pa: un ente, più uffici, ognuno col suo Codice Univoco
// Ufficio di 6 caratteri, uno solo predefinito. Logica pura, provata dai test.

import { erroreCodiceUfficio } from "@/lib/clienti/clienteFiscale";

export interface UfficioPa {
  id: string;
  company_id: string;
  anagrafica_id: string;
  descrizione: string;
  codice_univoco_ufficio: string;
  predefinito: boolean;
  attivo: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export const COLONNE_UFFICIO_PA =
  "id, company_id, anagrafica_id, descrizione, codice_univoco_ufficio, predefinito, attivo, note, created_at, updated_at";

export interface UfficioPaForm {
  descrizione: string;
  codice: string;
  note?: string;
}

export function normalizzaCodiceUfficio(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\s+/g, "").toUpperCase();
}

/** Errori del form ufficio; `altri` = gli altri uffici dello stesso ente (per i doppioni). */
export function problemiUfficioPa(f: UfficioPaForm, altri: Pick<UfficioPa, "id" | "codice_univoco_ufficio">[] = [], idCorrente?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const codice = normalizzaCodiceUfficio(f.codice);
  const err = erroreCodiceUfficio(codice);
  if (err) e.codice = err;
  else if (altri.some((u) => u.id !== idCorrente && u.codice_univoco_ufficio === codice)) {
    e.codice = "Questo codice c'è già tra gli uffici dell'ente";
  }
  if (!f.descrizione.trim()) e.descrizione = "Scrivi a quale ufficio corrisponde (es. Lavori pubblici)";
  return e;
}

/** In elenco: prima il predefinito, poi gli attivi per nome, in fondo i disattivati. */
export function ordinaUfficiPa<T extends Pick<UfficioPa, "predefinito" | "attivo" | "descrizione">>(uffici: T[]): T[] {
  return [...uffici].sort(
    (a, b) =>
      Number(b.predefinito) - Number(a.predefinito) ||
      Number(b.attivo) - Number(a.attivo) ||
      a.descrizione.localeCompare(b.descrizione, "it"),
  );
}

/** L'ufficio da proporre in commessa o fattura: il predefinito attivo, o l'unico attivo. */
export function ufficioDaProporre<T extends Pick<UfficioPa, "id" | "predefinito" | "attivo">>(uffici: T[]): T | null {
  const attivi = uffici.filter((u) => u.attivo);
  return attivi.find((u) => u.predefinito) ?? (attivi.length === 1 ? attivi[0] : null);
}

export function etichettaUfficioPa(u: Pick<UfficioPa, "descrizione" | "codice_univoco_ufficio">): string {
  return u.descrizione ? `${u.descrizione} · ${u.codice_univoco_ufficio}` : u.codice_univoco_ufficio;
}
