import type { ColonnaTabella } from "@/lib/tabelle/colonneTabella";

/**
 * Le colonne che l'azienda può scegliere e riordinare in Prima nota (26/11/2026). Fuori da
 * qui restano la casella di selezione e la colonna delle azioni: stanno agli estremi.
 *
 * Fisse sono la data, la descrizione e l'importo: sono ciò che identifica un movimento, e
 * senza una di loro la riga non si legge. Le altre undici l'impresa le accende come vuole:
 * chi non tiene i conti divisi per banca non guarda «Conto», chi non lavora in subappalto
 * non guarda «Fornitore».
 */
export const DEF_PRIMA_NOTA: ColonnaTabella[] = [
  { chiave: "data", etichetta: "Data", fissa: true },
  { chiave: "categoria", etichetta: "Categoria" },
  { chiave: "descrizione", etichetta: "Descrizione", fissa: true },
  { chiave: "importo", etichetta: "Importo", fissa: true },
  { chiave: "progressivo", etichetta: "Progressivo pagina" },
  { chiave: "metodo", etichetta: "Metodo" },
  { chiave: "conto", etichetta: "Conto" },
  { chiave: "origine", etichetta: "Origine" },
  { chiave: "documento", etichetta: "Documento" },
  { chiave: "commessa", etichetta: "Commessa" },
  { chiave: "fornitore", etichetta: "Fornitore" },
  { chiave: "riferimento", etichetta: "Riferimento" },
  { chiave: "allegato", etichetta: "Allegato" },
];

/** Le colonne con le cifre, allineate a destra. */
export const PRIMA_NOTA_A_DESTRA = new Set(["importo", "progressivo"]);

/** Il titolo in testa a «Progressivo pagina» spiega cosa somma. */
export const PRIMA_NOTA_TITOLI: Record<string, string> = {
  progressivo: "Somma progressiva dei movimenti visualizzati nella pagina",
};
