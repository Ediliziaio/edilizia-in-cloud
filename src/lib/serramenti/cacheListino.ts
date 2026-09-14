import type { QueryClient } from "@tanstack/react-query";

/**
 * Il preventivatore serramenti legge il listino con chiavi sue (e le tiene
 * 5 minuti): dopo una modifica al listino vanno rinfrescate anche quelle.
 * Prima un prezzo o una variante cambiati nel listino arrivavano in un
 * preventivo aperto solo dopo qualche minuto, e il ricalcolo usava i vecchi.
 */
const CHIAVI_LISTINO_PREVENTIVATORE = [
  "sr-listino-families",
  "sr-listino-families-by-ids",
  "sr-listino-griglia",
  "sr-listino-macrocategorie",
  "sr-listino-categorie",
] as const;

export function invalidaListinoNelPreventivatore(qc: QueryClient): void {
  for (const chiave of CHIAVI_LISTINO_PREVENTIVATORE) {
    void qc.invalidateQueries({ queryKey: [chiave] });
  }
}
