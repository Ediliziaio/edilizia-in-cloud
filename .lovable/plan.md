

# Ottimizzazione riga footer tabella Costi

## Problema
Dallo screenshot, la riga footer ha troppo spazio vuoto tra "Totale (35)" e le colonne numeriche. Le celle vuote intermedie (Origine, Tipo, Fornitore, Categoria) occupano spazio inutilmente, e il riepilogo "Da pagare / Pagato" è troppo distante dai totali.

## Soluzione
Usare `colSpan` per collassare le celle vuote, rendendo la riga più compatta e leggibile:

**`src/components/forecast/CostsTable.tsx`** — riga footer (~425-445):
1. Prima cella: checkbox vuota (w-10)
2. "Totale (N)" con `colSpan` che copre Nome + Origine + (Tipo se "all") + Fornitore + Categoria — elimina le 4-5 celle vuote
3. Imponibile, IVA, Totale Lordo — ciascuna nella propria cella allineata a destra
4. Riepilogo "Da pagare / Pagato" con `colSpan` che copre Ricorrenza + Scadenza + Stato — porta il riepilogo più vicino ai numeri
5. Cella Ordine (se visibile) + Azioni — collassate con `colSpan`

Risultato: layout più compatto, numeri ravvicinati al label, meno gap visivo.

