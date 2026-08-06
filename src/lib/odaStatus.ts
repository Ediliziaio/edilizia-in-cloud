/**
 * Stati degli Ordini d'Acquisto — UNICA fonte per label, colori e transizioni.
 *
 * Prima queste mappe erano ridefinite in 4 file (PurchaseOrdersList,
 * PurchaseOrderDetail, LinkedPurchaseOrdersCard, LinkExistingPurchaseOrderDialog),
 * e l'ultima ne aveva solo 3 su 6: un OdA "parziale" nel picker compariva
 * senza etichetta. Il CHECK sul DB ammette esattamente questi sei valori.
 */

export const ODA_STATUSES = [
  "bozza",
  "inviato",
  "confermato",
  "parziale",
  "ricevuto",
  "annullato",
] as const;

export type OdaStatus = (typeof ODA_STATUSES)[number];

// NB: le mappe sono Record<string, ...> di proposito — i consumatori
// indicizzano con order.status che dal DB arriva come string. OdaStatus resta
// il tipo di riferimento per chi costruisce valori nuovi.
export const ODA_STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza",
  inviato: "Inviato",
  confermato: "Confermato",
  parziale: "Parziale",
  ricevuto: "Ricevuto",
  annullato: "Annullato",
};

/** Classi badge (chip colorata) — palette identica ovunque. */
export const ODA_STATUS_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  inviato: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  confermato: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  parziale: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  ricevuto: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  annullato: "bg-destructive/10 text-destructive",
};

/** Variante per il componente Chip usato in lista/dettaglio. */
export const ODA_STATUS_CHIP_VARIANT: Record<string, "default" | "green" | "orange" | "red" | "navy" | "yellow" | "blue"> = {
  bozza: "default",
  inviato: "blue",
  confermato: "green",
  parziale: "yellow",
  ricevuto: "green",
  annullato: "red",
};

/**
 * Transizioni ammesse da ciascuno stato (ricevuto/annullato sono terminali).
 *
 * NB: dalla bozza il percorso dipende anche da COME e' stato ordinato — chi
 * compra al banco non ha niente da inviare. Per quel caso usare
 * `prossimiStatiOda(status, origine)` in @/lib/odaOrigine, che tiene conto
 * dell'origine; questa mappa resta il percorso classico via email.
 */
export const ODA_STATUS_FLOW: Record<string, string[]> = {
  bozza: ["inviato", "annullato"],
  inviato: ["confermato", "annullato"],
  confermato: ["parziale", "ricevuto"],
  parziale: ["ricevuto"],
  ricevuto: [],
  annullato: [],
};

/**
 * Stati che contano come costo/impegno verso il fornitore.
 * Stessa regola di OrderEconomicsSummary e della vista v_ordine_marginalita:
 * le bozze non sono impegni, gli annullati non sono costi.
 */
export const ODA_STATI_EMESSI: OdaStatus[] = ["inviato", "confermato", "parziale", "ricevuto"];
