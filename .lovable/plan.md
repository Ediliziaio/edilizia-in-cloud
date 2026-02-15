

# Stabilizzazione e Pulizia Progetto - Sezione Costi

## 1. Bug Critico: Previsionale mostra articoli da Giacenze

### Problema
Il hook `useCashFlowData.ts` (riga 113-130) nella query `supplierBalances` recupera TUTTI gli `order_items` con `supplier_id` non nullo, **senza escludere** quelli con `stock_item_id` valorizzato. Questo significa che articoli come "Motore Tapparelle mario" (prelevati dal magazzino) appaiono ancora nel **Previsionale Cassa** come pagamenti fornitori attesi, anche se sono stati correttamente esclusi dalla sezione Costi.

### Fix
Aggiungere `.is("stock_item_id", null)` alla query `supplierBalances` in `useCashFlowData.ts` (riga 124), allineandola con la correzione gia' applicata in `CompanyCostsManager.tsx`.

### File: `src/hooks/useCashFlowData.ts`
Dopo la riga `.not("supplier_id", "is", null)` (riga 124), aggiungere:
```
.is("stock_item_id", null)
```

---

## 2. Bug Secondario: query `pendingItems` include articoli da Giacenze

La query `pendingItems` (riga 92-108) filtra per status `da_ordinare`/`ordinato` ma non esclude `stock_item_id`. In teoria articoli da stock non dovrebbero avere questi status, ma per sicurezza conviene aggiungere lo stesso filtro.

### File: `src/hooks/useCashFlowData.ts`
Aggiungere `.is("stock_item_id", null)` anche alla query `pendingItems` (dopo riga 102).

---

## 3. Pulizia codice morto e import inutili

### File: `src/components/forecast/CompanyCostsManager.tsx`

Dopo analisi completa del file (1899 righe):
- **Tutti gli import sono utilizzati** - nessun import morto trovato
- **Tutte le variabili di stato sono referenziate**
- **Tutte le mutation sono collegate a bottoni/azioni nell'interfaccia**
- Il file e' grande ma ben organizzato con logica coerente

### Nessun codice morto identificato
La pulizia della tab Fornitori e delle relative query/useMemo e' gia' stata eseguita nella sessione precedente.

---

## 4. Verifica funzionale (risultati)

| Check | Stato |
|-------|-------|
| Console errori runtime | Nessun errore (solo warning postMessage irrilevanti) |
| Network requests | Tutte 200 OK |
| Filtro `stock_item_id` in CompanyCostsManager | Corretto (gia' applicato) |
| Filtro `stock_item_id` in useCashFlowData | **DA CORREGGERE** (mancante) |
| Tabs Costi (Tutti/Fissi/Variabili) | Funzionanti |
| Stat cards | Funzionanti |
| Dialog creazione/modifica/duplica | Funzionanti |
| Loading states | Presenti (Skeleton) |
| Empty states | Presenti ("Nessun costo trovato" con icona) |
| Filtri (periodo/stato/fornitore/categoria) | Funzionanti |
| Azioni bulk (seleziona/paga/elimina) | Funzionanti |

---

## 5. Riepilogo Modifiche

| Azione | File | Dettaglio |
|--------|------|-----------|
| Bug fix | `src/hooks/useCashFlowData.ts` | Aggiungere `.is("stock_item_id", null)` a query `supplierBalances` (riga 124) |
| Bug fix | `src/hooks/useCashFlowData.ts` | Aggiungere `.is("stock_item_id", null)` a query `pendingItems` (riga 102) |

Nessuna modifica al database. Nessun file rimosso. Nessun cambio di comportamento funzionale - solo allineamento del filtro Giacenze tra Costi e Previsionale.

