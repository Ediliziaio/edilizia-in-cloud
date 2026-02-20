
# Analisi Sezione Ordini

## Stato Generale: Funzionante, ben strutturato

La sezione e la piu complessa del progetto: 26 file (4 pagine + 22 componenti + 1 libreria utility), con gestione completa ordini CRUD, pipeline drag-and-drop, articoli con fornitori e magazzino, riepilogo finanziario (acconti/finanziamento/bonus edilizio), conto economico per ordine, provvigioni venditori, errori/perdite, allegati ordine e articoli, manodopera (dipendenti + squadre esterne), import/export CSV, filtri avanzati, paginazione, azioni bulk.

---

## BUG TROVATO

### 1. Eliminazione ordine dal dettaglio NON cancella tasks e appuntamenti collegati (Priorita: Media)
**File**: `src/pages/azienda/OrderDetail.tsx` (righe 389-427)

La funzione `deleteOrderMutation` nel dettaglio ordine elimina correttamente: order_item_attachments, order_items, order_status_history, order_employees, order_external_teams, order_salespeople, order_attachments, order_errors.

Tuttavia **NON elimina `tasks` e `appointments`** collegati all'ordine tramite `order_id`.

La stessa operazione nella lista ordini (`OrdersList.tsx`, righe 240-258) li elimina correttamente:
```
await supabase.from("tasks").delete().eq("order_id", orderId),
await supabase.from("appointments").delete().eq("order_id", orderId),
```

Questo causa record orfani nel database quando un ordine viene eliminato dalla pagina di dettaglio.

**Fix**: Aggiungere le due righe mancanti nel `Promise.all` della `deleteOrderMutation` in `OrderDetail.tsx`.

### 2. CustomerOrderAttachments mostra TUTTI gli allegati al cliente, inclusi quelli interni (Priorita: Alta)
**File**: `src/components/orders/OrderAttachments.tsx` (righe 466-525)

Il componente `CustomerOrderAttachments` (usato nel portale cliente) esegue una query senza filtrare per `visible_to_customer = true`. Il componente lato azienda (`OrderAttachments`) gestisce correttamente la distinzione "visibile al cliente" vs "solo uso interno" (righe 226-227), ma il componente cliente non applica il filtro.

Se le RLS policies non filtrano automaticamente per `visible_to_customer`, tutti i documenti interni (preventivi, note riservate, documenti gestionali) sarebbero visibili ai clienti.

**Fix**: Aggiungere `.eq("visible_to_customer", true)` alla query nella riga 474 di `CustomerOrderAttachments`.

---

## DEAD CODE TROVATO

Nessun dead code significativo trovato nella sezione Ordini. Tutti gli import sono utilizzati, tutte le variabili destructurate sono usate, nessun componente orfano.

---

## NOTE DI DEBITO TECNICO

### Duplicazione logica di eliminazione ordine
La logica di cascade delete degli ordini e duplicata tra `OrdersList.tsx` (funzione `deleteOneOrder`) e `OrderDetail.tsx` (funzione `deleteOrderMutation`). Idealmente andrebbe estratta in un hook condiviso `useDeleteOrder` per evitare la divergenza che ha causato il bug #1. Segnalato come refactoring futuro.

---

## NESSUN ALTRO BUG TROVATO

- Query ordini con join corretti (customer, status) e filtro company_id
- Calcolo costi variabili: scorporo IVA corretto per articoli e squadre esterne, dipendenti gia netti
- Provvigioni: calcolo corretto per tipo (fisso, % venduto, % incassato) con decurtazioni
- Pipeline drag-and-drop: aggiornamento stato + storico coerente
- Creazione ordine: funzione atomica `create_order_atomic` con transazione PostgreSQL
- Modifica ordine: upsert articoli granulare (non distruttivo), draft auto-save con localStorage
- Filtri: ricerca testuale + stato + pagamento + cliente + importo + date + mese tutti funzionanti
- Paginazione: 20 ordini/pagina, reset automatico su cambio filtri
- Export CSV: formato corretto con BOM UTF-8
- Import CSV: validazione campi, match cliente per email, stato default
- Articoli ordine: CRUD con catalogo, fornitore, magazzino, pagamenti a rate
- Allegati ordine e articoli: upload/delete con storage, visibilita cliente gestita
- Riepilogo finanziario: standard/finanziamento, bonus edilizio, input netto/lordo
- Conto economico: vendita + costi articoli + manodopera + provvigioni + errori = margine
- Pagamenti fornitori: raggruppamento per fornitore, tracking rate, scadenze
- Alert ordine: posa imminente con articoli non pronti, merce in ritardo
- Azioni bulk: cambio stato multiplo, eliminazione multipla con conferma

---

## RIEPILOGO INTERVENTI

| File | Intervento | Priorita |
|------|-----------|----------|
| `src/pages/azienda/OrderDetail.tsx` | Aggiungere delete di `tasks` e `appointments` nella cascade delete | Media |
| `src/components/orders/OrderAttachments.tsx` | Filtrare `visible_to_customer = true` nel componente cliente | Alta |
