

# Miglioramento Layout Dettaglio Ordine

## Problema

Il layout attuale usa una griglia `lg:grid-cols-3` con colonna sinistra (2/3) e destra (1/3). La sinistra ha solo 5 card (Descrizione, Articoli, Documenti, Stato, Storico), mentre la destra ne ha 11 (Cliente, Riepilogo Finanziario, Economia, Pagamenti Fornitori, Manodopera, Provvigioni, Errori, Data Consegna, Note, Task, Appuntamenti). Risultato: sinistra vuota, destra sovraffollata.

## Soluzione: Riorganizzare le sezioni

Spostare le card più "pesanti" e informative dalla colonna destra alla sinistra, lasciando a destra solo le info rapide di riepilogo.

### Nuovo layout proposto

**Colonna sinistra (2/3):**
1. Descrizione Lavoro
2. Articoli (OrderItemsList)
3. Documenti (OrderAttachments)
4. Riepilogo Finanziario (FinancialSummaryReadOnly) — **spostato da destra**
5. Economia Ordine (OrderEconomics) — **spostato da destra**
6. Pagamenti Fornitori (SupplierPaymentsCard) — **spostato da destra**
7. Costi Manodopera (OrderLaborCosts) — **spostato da destra**
8. Provvigioni (OrderCommissions) — **spostato da destra**
9. Errori Ordine (OrderErrors) — **spostato da destra**

**Colonna destra (1/3):**
1. Cliente
2. Stato Ordine (OrderProgressTracker) — **spostato da sinistra** (più compatto nella sidebar)
3. Storico Stati — **spostato da sinistra** (collegato allo stato)
4. Data Consegna Prevista
5. Note Interne
6. Task Collegati
7. Appuntamenti Collegati

### File da modificare

**`src/pages/azienda/OrderDetail.tsx`** — Riorganizzare l'ordine delle card tra le due colonne del grid, spostando le sezioni finanziarie/economiche nella colonna principale e le sezioni di stato/note nella sidebar.

