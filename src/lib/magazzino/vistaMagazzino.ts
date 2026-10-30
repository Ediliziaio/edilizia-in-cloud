/**
 * Le viste del magazzino, raggruppate. Erano undici schede in fila
 * (29/10/2026); ora quattro gruppi, ognuno con le sue sotto-viste:
 *
 *   Da preparare   Lista · Pipeline · Calendario · Da comprare
 *                  (gli articoli delle commesse, in tre forme, e cosa comprare)
 *   Giacenze       Inventario · Lotti · Valore
 *   Arrivi e uscite  Bolle in arrivo · Uscite
 *   Movimenti      il registro di carichi e scarichi
 *
 * «Scadenze» non è più una scheda: nessun lotto ha una data di scadenza
 * (29/10/2026, tutte le aziende). Diventa l'avviso dentro Giacenze, che
 * compare solo quando un lotto scade davvero.
 *
 * I valori delle viste sono quelli di sempre (`ViewMode`): cambia solo come
 * si scelgono.
 */
import type { ViewMode } from "@/hooks/useWarehouseData";

export type GruppoMagazzino = "preparare" | "giacenze" | "arrivi" | "movimenti";

export interface Gruppo {
  key: GruppoMagazzino;
  label: string;
  viste: { key: ViewMode; label: string }[];
}

export const GRUPPI_MAGAZZINO: Gruppo[] = [
  {
    key: "preparare",
    label: "Da preparare",
    viste: [
      { key: "list", label: "Lista" },
      { key: "kanban", label: "Pipeline" },
      { key: "calendar", label: "Calendario" },
      { key: "purchase_list", label: "Da comprare" },
    ],
  },
  {
    key: "giacenze",
    label: "Giacenze",
    viste: [
      { key: "stock", label: "Inventario" },
      { key: "lotti", label: "Lotti" },
      { key: "valuation", label: "Valore" },
    ],
  },
  {
    key: "arrivi",
    label: "Arrivi e uscite",
    viste: [
      { key: "ddt", label: "Bolle in arrivo" },
      { key: "uscite", label: "Uscite" },
    ],
  },
  { key: "movimenti", label: "Movimenti", viste: [{ key: "movements", label: "Registro" }] },
];

/** Sul telefono: lista e da comprare, inventario. Il resto è da scrivania. */
export const VISTE_MOBILE: ViewMode[] = ["list", "purchase_list", "stock"];

/** Il gruppo di una vista. «Scadenze», che non ha più una scheda, apre le giacenze. */
export function gruppoDi(vista: ViewMode): GruppoMagazzino {
  if (vista === "scadenze") return "giacenze";
  return GRUPPI_MAGAZZINO.find((g) => g.viste.some((v) => v.key === vista))?.key ?? "preparare";
}

/** La vista da mostrare davvero: una vista senza scheda ripiega sulla prima del suo gruppo. */
export function vistaEffettiva(vista: ViewMode, mobile: boolean): ViewMode {
  const v: ViewMode = vista === "scadenze" ? "stock" : vista;
  return mobile && !VISTE_MOBILE.includes(v) ? "list" : v;
}

/** I gruppi e le sotto-viste che si vedono, sul telefono solo quelle mobili. */
export function gruppiVisibili(mobile: boolean): Gruppo[] {
  if (!mobile) return GRUPPI_MAGAZZINO;
  return GRUPPI_MAGAZZINO
    .map((g) => ({ ...g, viste: g.viste.filter((v) => VISTE_MOBILE.includes(v.key)) }))
    .filter((g) => g.viste.length > 0);
}

/**
 * La vista da aprire scegliendo un gruppo: l'ultima usata in quel gruppo, se
 * c'è ed è visibile, altrimenti la prima.
 */
export function vistaDelGruppo(
  gruppo: GruppoMagazzino,
  ultime: Partial<Record<GruppoMagazzino, ViewMode>>,
  mobile: boolean,
): ViewMode {
  const g = gruppiVisibili(mobile).find((x) => x.key === gruppo);
  if (!g) return "list";
  const ultima = ultime[gruppo];
  return ultima && g.viste.some((v) => v.key === ultima) ? ultima : g.viste[0].key;
}
