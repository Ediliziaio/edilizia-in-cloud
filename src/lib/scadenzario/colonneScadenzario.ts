import type { ColonnaTabella } from "@/lib/tabelle/colonneTabella";

/**
 * Le colonne che l'azienda può scegliere e riordinare (26/11/2026). Fuori da qui restano la
 * casella di selezione e la colonna delle azioni: stanno agli estremi e non si toccano.
 *
 * «Tipo» nasce spenta perché prima si vedeva solo sopra i 1800px: chi non l'ha mai vista non
 * se la trova comparire, e chi la vedeva la riaccende dal pannellino. Le altre due classi
 * `hidden … table-cell` sono sparite: ora è la scelta dell'azienda a dire cosa si vede, e una
 * spunta che non fa comparire la colonna sarebbe una spunta che mente.
 */
export const DEF_SCADENZE: ColonnaTabella[] = [
  { chiave: "scadenza", etichetta: "Scadenza", fissa: true },
  { chiave: "tipo", etichetta: "Tipo", spentaDiSerie: true },
  { chiave: "controparte", etichetta: "Cliente / fornitore" },
  { chiave: "descrizione", etichetta: "Descrizione", fissa: true },
  { chiave: "documento", etichetta: "Documento \u00b7 commessa" },
  { chiave: "metodo", etichetta: "Modalit\u00e0" },
  { chiave: "importo", etichetta: "Importo" },
  { chiave: "residuo", etichetta: "Residuo" },
  { chiave: "stato", etichetta: "Stato" },
];

/** La testata di ogni colonna: solo l'allineamento cambia, il resto è uguale. */
export const TESTA_A_DESTRA = new Set(["importo", "residuo"]);
