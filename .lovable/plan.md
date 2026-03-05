

# Audit Sezione Ordini + Dettaglio Ordine

## 1. Analisi pulizia codice

Ho analizzato tutti i file in `src/components/orders/` (23 componenti), `src/pages/azienda/OrderDetail.tsx`, `src/pages/azienda/OrdersList.tsx`, `CreateOrder.tsx`, `EditOrder.tsx` e `src/lib/orderUtils.ts`.

**Risultato: nessun componente orfano o codice morto trovato.** Tutti i 23 componenti in `src/components/orders/` sono importati e utilizzati. Le utility in `orderUtils.ts` sono tutte referenziate. I due componenti "customer-facing" (`CustomerDatesCard`, `CustomerFinancialSummary`) sono usati nella vista cliente (`CustomerOrderDetail.tsx`).

**Nessun file da rimuovere.**

## 2. Fix funzionali identificati

### 2a. Memory note obsoleta
La memory `features/orders/detail-layout-standard` dice che Pagamenti Fornitori, Manodopera, Provvigioni, Errori sono nella colonna sinistra. Ma li abbiamo appena spostati a destra. La memory va aggiornata (non è un fix di codice, ma evita confusione futura).

### 2b. Nessun bug funzionale rilevato
- Le query sono tutte protette con `enabled: !!id && !!user` o `!!effectiveCompany?.id`
- Le mutation hanno `onSuccess`/`onError` con toast appropriati
- Lo stato vuoto ("Ordine non trovato", "Nessun ordine trovato") ha sempre CTA di ritorno
- Il loading skeleton è presente sia nella lista che nel dettaglio
- La paginazione gestisce correttamente i casi limite (`safePage = Math.min(currentPage, totalPages)`)
- Il drag & drop è stato corretto nel messaggio precedente

### 2c. Potenziale miglioramento: `orderIds` senza memo
In `OrdersList.tsx` riga 87: `const orderIds = orders.map(o => o.id)` viene ricalcolato ad ogni render e usato come dependency in 4 query `useQuery`. Andrebbe wrappato in `useMemo` per evitare re-fetch inutili.

## 3. Miglioramenti UX proposti

### 3a. Link al cliente nel dettaglio ordine
Nel dettaglio ordine, il nome del cliente è testo statico. Aggiungere un link navigabile a `/azienda/clienti/{customerId}` per accesso rapido.

### 3b. CustomerDatesCard mancante nel dettaglio ordine (admin)
Il componente `CustomerDatesCard` mostra date importanti (arrivo merce, inizio/fine lavori) ma è usato solo nella vista cliente. Il dettaglio ordine admin ha solo la "Consegna Prevista" ma non mostra `warehouse_arrival_date`, `work_start_date`, `work_end_date` che sono dati già disponibili nell'oggetto `order`. Aggiungere `CustomerDatesCard` nella sidebar destra.

### 3c. `orderIds` memoizzato
Wrappare in `useMemo` per evitare re-render cascade.

## 4. Piano implementativo

### File da modificare

**`src/pages/azienda/OrderDetail.tsx`**:
1. Aggiungere import di `CustomerDatesCard`
2. Aggiungere link al cliente nella card "Cliente" (wrap nome in `Link`)
3. Aggiungere `CustomerDatesCard` nella sidebar dopo "Consegna Prevista", passando `warehouse_arrival_date`, `work_start_date`, `work_end_date`

**`src/pages/azienda/OrdersList.tsx`**:
1. Wrappare `orderIds` (riga 87) in `useMemo(() => orders.map(o => o.id), [orders])`

### Nessun file da rimuovere

## 5. Conferma audit

- Tutti i componenti sono utilizzati, nessun codice morto
- Nessun errore runtime o warning critico in console
- Loading/empty/error states tutti gestiti con CTA
- Filtri, paginazione, bulk actions funzionanti
- Drag & drop pipeline corretto (fix precedente)
- Unico miglioramento tecnico: memoizzazione `orderIds`
- Unici miglioramenti UX: link cliente + card date operative

