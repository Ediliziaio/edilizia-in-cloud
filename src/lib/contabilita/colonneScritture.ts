import type { ColonnaTabella } from "@/lib/tabelle/colonneTabella";

/**
 * Le colonne dell'elenco scritture di Contabilità generale (26/11/2026).
 *
 * In quella pagina ci sono otto tabelle, ma «le colonne» hanno senso solo qui: bilancio,
 * mastrini e partitari sono prospetti, dove le colonne *sono* il prospetto e sceglierle non
 * vorrebbe dire niente. L'elenco scritture invece è la lista in cui si lavora ogni giorno.
 *
 * Fisse il numero, la data e l'importo: una riga di libro giornale senza una delle tre non
 * si legge, e nel numero c'è il pulsante che apre la scrittura. Le altre tre l'impresa le
 * accende come vuole — chi registra tutto da documento guarda «Documento» e non «Causale»,
 * chi fa molte scritture a mano il contrario.
 */
export const DEF_SCRITTURE: ColonnaTabella[] = [
  { chiave: "numero", etichetta: "N. scrittura", fissa: true },
  { chiave: "data", etichetta: "Data", fissa: true },
  { chiave: "causale", etichetta: "Causale" },
  { chiave: "documento", etichetta: "Documento" },
  { chiave: "descrizione", etichetta: "Descrizione" },
  { chiave: "importo", etichetta: "Importo", fissa: true },
];

/** Le cifre a destra. */
export const SCRITTURE_A_DESTRA = new Set(["importo"]);

/** Le spiegazioni in testa alla colonna, dove il titolo da solo si fraintende. */
export const SCRITTURE_TITOLI: Record<string, string> = {
  numero: "Numero nel libro giornale, in ordine di data: non il numero della fattura",
  documento: "Numero e data della fattura o del documento da cui viene la scrittura",
};
