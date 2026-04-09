/**
 * Items standard della checklist sicurezza giornaliera.
 * Hardcoded ma pronti per configurazione admin in futuro.
 */

export type ChecklistCategoria = "dpi" | "cantiere" | "emergenza" | "ambiente";

export interface ChecklistItemDef {
  id: string;
  label: string;
  categoria: ChecklistCategoria;
  critico: boolean;
  fotoRichiesta: boolean;
  iconKey: string;
}

export const CHECKLIST_ITEMS: readonly ChecklistItemDef[] = [
  { id: "casco", label: "Casco protettivo indossato", categoria: "dpi", critico: true, fotoRichiesta: false, iconKey: "hard-hat" },
  { id: "scarpe", label: "Scarpe antinfortunistiche indossate", categoria: "dpi", critico: true, fotoRichiesta: false, iconKey: "boot" },
  { id: "guanti", label: "Guanti da lavoro indossati", categoria: "dpi", critico: false, fotoRichiesta: false, iconKey: "hand" },
  { id: "imbracatura", label: "Imbracatura di sicurezza (se lavori in quota)", categoria: "dpi", critico: true, fotoRichiesta: true, iconKey: "link" },
  { id: "giubbotto", label: "Giubbotto alta visibilità indossato", categoria: "dpi", critico: true, fotoRichiesta: false, iconKey: "shirt" },
  { id: "area_delimitata", label: "Area cantiere delimitata e segnalata", categoria: "cantiere", critico: true, fotoRichiesta: true, iconKey: "triangle-alert" },
  { id: "segnaletica", label: "Segnaletica di sicurezza presente e visibile", categoria: "cantiere", critico: true, fotoRichiesta: true, iconKey: "sign" },
  { id: "estintori", label: "Estintori presenti e accessibili", categoria: "emergenza", critico: true, fotoRichiesta: false, iconKey: "flame" },
  { id: "primo_soccorso", label: "Cassetta primo soccorso presente", categoria: "emergenza", critico: true, fotoRichiesta: false, iconKey: "heart-pulse" },
  { id: "vie_fuga", label: "Vie di fuga libere e segnalate", categoria: "emergenza", critico: true, fotoRichiesta: false, iconKey: "door-open" },
  { id: "impalcature", label: "Impalcature controllate (se presenti)", categoria: "cantiere", critico: false, fotoRichiesta: true, iconKey: "layers" },
  { id: "meteo", label: "Condizioni meteo verificate", categoria: "ambiente", critico: false, fotoRichiesta: false, iconKey: "cloud" },
] as const;

export interface ChecklistRisposta {
  itemId: string;
  checked: boolean;
  fotoUrl?: string;
  note?: string;
  timestamp: string;
}

export function createInitialRisposte(): ChecklistRisposta[] {
  return CHECKLIST_ITEMS.map((item) => ({
    itemId: item.id,
    checked: false,
    timestamp: new Date().toISOString(),
  }));
}

export function isChecklistCompleta(risposte: ChecklistRisposta[]): boolean {
  // Tutti gli item critici devono essere checked
  const criticalIds = CHECKLIST_ITEMS.filter((i) => i.critico).map((i) => i.id);
  return criticalIds.every((id) => {
    const r = risposte.find((x) => x.itemId === id);
    return r?.checked === true;
  });
}
