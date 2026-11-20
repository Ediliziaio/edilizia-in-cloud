import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";

export type MaterialeDaVerificare = Pick<MaterialeFase, "id" | "order_id" | "name" | "quantity" | "unita_misura" | "specifiche" | "origini">;
export interface BozzaVerificaMateriale { nome: string; quantita: string; unita: string; specifiche: string; nota: string }

/** Riusa solo testo documentale, senza trasformare una ricetta in caratteristiche confermate. */
export function specificheGiaLette(m: MaterialeDaVerificare): string {
  if (m.specifiche?.trim()) return m.specifiche;
  if (m.origini?.length !== 1) return "";
  const origine = m.origini[0];
  const dati = "dati_documentali" in origine ? origine.dati_documentali : undefined;
  if (!dati || dati.quantita === "stimata") return "";
  if (dati.specifiche.some(s => s.trim())) return dati.specifiche.filter(s => s.trim()).join("\n");
  const campi = "verifica_acquisto" in origine ? origine.verifica_acquisto?.campi_mancanti ?? [] : [];
  if (origine.tipo === "contratto" && campi.length > 0 && campi.every(c => c === "unita") && dati.fonti.length === 1) {
    return dati.fonti[0].descrizione.trim();
  }
  return "";
}

export function bozzaDelMateriale(m: MaterialeDaVerificare): BozzaVerificaMateriale {
  return { nome: m.name, quantita: String(m.quantity), unita: m.unita_misura ?? "", specifiche: specificheGiaLette(m), nota: "" };
}

/** Una bozza non si riapplica se la riga o il documento sono cambiati nel frattempo. */
export function versionePerBozza(m: MaterialeDaVerificare): string {
  return JSON.stringify([m.id, m.order_id, m.name, m.quantity, m.unita_misura, m.specifiche, m.origini]);
}

export function bozzaModificata(m: MaterialeDaVerificare, bozza: BozzaVerificaMateriale): boolean {
  const iniziale = bozzaDelMateriale(m);
  return (Object.keys(iniziale) as (keyof BozzaVerificaMateriale)[]).some(c => iniziale[c] !== bozza[c]);
}
