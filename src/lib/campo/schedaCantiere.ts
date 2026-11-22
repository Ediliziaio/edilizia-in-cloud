import type { TipoDocumentoCantiere } from "@/lib/commesse/documentiCantiere";
import type { FaseInput } from "@/lib/orders/cronoprogramma";
import type { Sottofase } from "@/lib/orders/sottofasi";

export interface CantiereTecnico {
  id: string;
  codice: string | null;
  titolo: string | null;
  indirizzo: string | null;
}

export interface FaseSchedaCantiere extends FaseInput {
  note: string | null;
  primo: string | null;
  ultimo: string | null;
  sottofasi: Sottofase[];
}

export interface DocumentoSchedaCantiere {
  id: string;
  nome: string;
  mime: string | null;
  percorso: string;
  categoria: TipoDocumentoCantiere;
  revisione: string | null;
}

export interface SchedaCantiere {
  cantiere: CantiereTecnico & { inizio: string | null; fine: string | null; progresso: number | null };
  fasi?: FaseSchedaCantiere[];
  documenti?: DocumentoSchedaCantiere[];
}

export type SezioneSchedaCantiere = "piano" | "documenti";
export type AreaSchedaCantiere = "campo" | "tecnico";

export interface PersonaAccessoTecnico {
  id: string;
  nome: string;
  abilitato: boolean;
  ammissibile: boolean;
}

export function percorsoCantiereTecnico(area: AreaSchedaCantiere, ordine?: string) {
  return `/${area}/cantieri${ordine ? `/${encodeURIComponent(ordine)}` : ""}`;
}

export function titoloCantiereTecnico(cantiere: CantiereTecnico) {
  return cantiere.titolo?.trim() || cantiere.codice || "Cantiere";
}
