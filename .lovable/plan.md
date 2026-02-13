
# Piano: Stabilizzazione e Completamento EdiliziaInCloud

## Premessa

L'applicazione e gia molto avanzata e copre gran parte dei flussi richiesti. Dopo un audit completo del codice, ho identificato bug critici, funzionalita mancanti e miglioramenti necessari. Il piano e organizzato per priorita: prima i bug bloccanti, poi le funzionalita mancanti, infine le ottimizzazioni.

---

## FASE 1: Bug Critici (Priorita Massima)

### Bug 1 - Perdita dati articoli in OrderDetail
**File**: `src/pages/azienda/OrderDetail.tsx` (righe 334-358)

La mutation `updateOrderItemsMutation` cancella e ricrea gli articoli ma salva solo `name, description, quantity, status, position`. Vengono persi:
- `supplier_id` (fornitore)
- `purchase_price` (costo acquisto)
- `vat_rate` (aliquota IVA)
- `stock_item_id` (articolo da magazzino)

**Impatto**: Ogni modifica di stato articoli dalla pagina dettaglio ordine azzera i costi e i fornitori associati.

**Fix**: Aggiungere i campi mancanti nell'oggetto `itemsToInsert`.

### Bug 2 - Warning console forwardRef in CustomersList
**File**: `src/pages/azienda/CustomersList.tsx`

I componenti `Dialog` e `AlertDialog` generano warning React perche ricevono ref senza usare `forwardRef`. Questo e un problema di integrazione con Radix UI.

**Fix**: Verificare che i componenti wrapper siano compatibili con ref forwarding.

### Bug 3 - Route Dipendenti mancante dal pannello azienda
**File**: `src/App.tsx` e `src/components/layouts/CompanyLayout.tsx`

La pagina `src/pages/azienda/Employees.tsx` esiste ma non ha una route in App.tsx ne un link nella sidebar aziendale. I dipendenti sono gestibili solo se si conosce l'URL diretto.

**Fix**: Aggiungere route `/azienda/dipendenti` in App.tsx e link nella sidebar di CompanyLayout.

---

## FASE 2: Flusso Ordine End-to-End (Completamento)

### 2.1 - Pagina Dettaglio Ordine: dati articoli completi
Assicurarsi che la fetch degli `orderItems` in OrderDetail includa `vat_rate` nel tipo `OrderItemData` e nella mappatura `displayItems`, cosi il Conto Economico calcola correttamente l'IVA per articolo.

### 2.2 - Validazioni ordine robuste
Aggiungere validazioni mancanti nel flusso di creazione/modifica ordine:
- Sconto negativo non ammesso
- Quantita decimali: bloccare o arrotondare
- Data incasso prima della data ordine: warning visuale
- Importo totale 0 con articoli presenti: warning

### 2.3 - Margine previsto vs consuntivo
Nella pagina OrderEconomics, aggiungere una sezione "Margine Previsto" che calcola il margine basandosi sui costi standard degli articoli (prezzo listino), confrontandolo con il "Margine Consuntivo" (costi reali registrati). Questo richiede:
- Aggiunta colonna `standard_cost` alla tabella `order_items` (opzionale, puo derivare da `purchase_price` al momento della creazione)
- Visualizzazione side-by-side previsto vs consuntivo con scostamento evidenziato

---

## FASE 3: Flusso Finanziario e Cash Flow (Rafforzamento)

### 3.1 - Collegamento costi a commessa
Verificare che ogni costo (manuale o automatico) nella sezione Costi mostri il link all'ordine associato. Gia implementato ma da verificare che funzioni correttamente per tutti i tipi.

### 3.2 - Alert squilibri finanziari
Nella Dashboard e nel Previsionale, aggiungere alert quando:
- I pagamenti previsti superano gli incassi previsti nel mese
- Il margine scende sotto una soglia configurabile (es. 10%)
- Ci sono pagamenti scaduti non incassati

### 3.3 - Stato incassi coerente
Verificare che il calcolo "Da Incassare" sia coerente tra Dashboard, OrdersList e CashFlowForecast. Dall'analisi il calcolo e gia unificato ma va testato con dati reali.

---

## FASE 4: Pulizia Codice

### 4.1 - Rimuovere import non utilizzati
Scansione automatica di import inutilizzati in tutti i file principali.

### 4.2 - Standardizzare gestione errori
Creare un pattern unificato per toast di errore/successo invece di ripetere lo stesso blocco `onError/onSuccess` in ogni mutation.

### 4.3 - Tipi coerenti
Unificare le interface duplicate (es. `OrderItem` definita in piu file con campi diversi) in un unico file di tipi condiviso.

---

## FASE 5: UX (Miglioramenti)

### 5.1 - Empty state corretto in CustomersList
Verificare che il messaggio empty state sia corretto ("Nessun cliente" e non "Nessun ticket").

### 5.2 - Loading states uniformi
Sostituire i testi "Caricamento..." con Skeleton/Spinner coerenti in tutte le pagine.

### 5.3 - Feedback immediato su azioni
Verificare che ogni azione critica (salva, elimina, cambia stato) abbia feedback toast coerente.

---

## Dettaglio Tecnico dei File Modificati

| File | Modifica |
|------|----------|
| `src/pages/azienda/OrderDetail.tsx` | Fix updateOrderItemsMutation per salvare tutti i campi articolo; aggiunta `vat_rate` al tipo OrderItemData |
| `src/pages/azienda/CustomersList.tsx` | Fix warning forwardRef |
| `src/App.tsx` | Aggiunta route `/azienda/dipendenti` |
| `src/components/layouts/CompanyLayout.tsx` | Aggiunta link Dipendenti nella sidebar |
| `src/components/orders/OrderEconomics.tsx` | Sezione margine previsto vs consuntivo |
| `src/pages/azienda/CompanyDashboard.tsx` | Alert squilibri finanziari |

---

## Nota importante

Questo piano e ampio e va implementato in fasi. Consiglio di procedere con la **Fase 1 (bug critici)** immediatamente, poi iterare sulle fasi successive. Il bug #1 (perdita dati articoli) e il piu urgente perche causa perdita di dati reali in produzione.
