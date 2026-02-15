
# Stabilizzazione e Miglioramento Sezione Costi e Previsionale

## Analisi Completata

Ho analizzato in dettaglio tutti i file coinvolti nella sezione Costi e Previsionale. Il codice e' funzionalmente solido ma presenta alcune aree di miglioramento in termini di pulizia, robustezza e UX.

---

## 1) Pulizia Codice

### Elementi da rimuovere/correggere in `CompanyCostsManager.tsx`:
- **Import `Upload`** da lucide-react: usato, OK
- **Import `Link`** da react-router-dom: usato nella tabella, OK
- Nessun import inutilizzato trovato nei file analizzati
- Le interfacce e tipi sono tutti referenziati correttamente

### Consolidamento:
- La costante `COST_IMPORT_FIELDS` potrebbe essere spostata in un file separato, ma essendo usata solo qui resta accettabile
- Il rendering inline della tabella fornitori (righe 1083-1100) con `(() => { ... })()` va estratto in un blocco `useMemo` separato per leggibilita'

---

## 2) Fix Funzionali

### Bug 1: Query `supplierBalances` non filtra per company
La query a riga 113-127 in `useCashFlowData.ts` filtra in JS con `.filter()` dopo aver scaricato tutti gli order_items con supplier. Questo funziona ma e' inefficiente. Tuttavia NON e' un bug bloccante - la filter e' corretta.

### Bug 2: `orderItemCosts` query stessa problematica
Riga 203-213: stessa filter post-fetch. Funzionale ma non ottimale.

### Bug 3: Potenziale null reference in `supplierPaymentsData`
Riga 341-360: `item.supplier?.name` e' protetto, ma `item.order?.company_id` potrebbe essere undefined se l'inner join fallisce. Il `.filter()` a riga 232 protegge ma va reso piu' robusto.

### Bug 4: `calculateGrossFromNet` restituisce oggetto ma in `exportCostsCSV` si accede `.grossAmount`
Riga 557-558: Funziona correttamente perche' la funzione restituisce `{ grossAmount, vatAmount }`.

### Bug 5: Nessuna validazione sull'importo nel form
Se l'utente inserisce un importo negativo o zero, il salvataggio procede. Va aggiunta validazione.

### Bug 6: Il campo `supplier_id` nel form viene settato a stringa vuota `""` invece di `"none"` in `handleSupplierChange`
Riga 652: quando si seleziona "none", `supplier_id` diventa `""` ma il Select usa `"none"` come valore. Questo causa inconsistenza visiva (il Select non mostra "Nessun fornitore" dopo la deselezione).

### Fix da implementare:
| Bug | File | Fix |
|-----|------|-----|
| Validazione importo | `CompanyCostsManager.tsx` | Aggiungere check `amount > 0` nel bottone salva |
| Supplier ID inconsistenza | `CompanyCostsManager.tsx` | Usare `"none"` coerentemente nel `handleSupplierChange` |
| Inline IIFE nel rendering | `CompanyCostsManager.tsx` | Estrarre in useMemo `supplierGroupedData` |

---

## 3) Miglioramenti UX

### 3a. Feedback immediato
- Aggiungere `disabled` state visivo durante tutte le mutation in corso (alcune gia' presenti, verificare completezza)
- Toast di successo/errore gia' implementati - OK

### 3b. Empty states
- La sezione Fornitori nella tab ha gia' un empty state con icona - OK
- La tabella costi ha empty state - OK

### 3c. Miglioramenti visivi nella sezione Costi
- Le 6 summary cards sono gia' ben implementate con colori distinti
- Il form dialog ha gia' il layout strutturato con sezioni separate
- Lo scorporo IVA in tempo reale e' gia' implementato

### 3d. Miglioramenti da implementare:
- **Loading state sui pulsanti azioni**: i pulsanti "Segna come pagato" e "Riporta a non pagato" non mostrano loading durante la mutation
- **Animazione transizione tab**: aggiungere una transizione fade tra i tab content
- **Tooltip sulle azioni**: alcuni pulsanti hanno `title` ma non Tooltip component - uniformare
- **Conferma visiva pagamento**: dopo aver segnato un costo come pagato, la riga dovrebbe avere una breve animazione di conferma (opacity flash)

---

## 4) Riepilogo Modifiche

| Azione | File | Dettaglio |
|--------|------|-----------|
| Fix | `CompanyCostsManager.tsx` | Correggere inconsistenza `supplier_id` nel form (vuoto vs "none") |
| Fix | `CompanyCostsManager.tsx` | Aggiungere validazione importo > 0 |
| Refactor | `CompanyCostsManager.tsx` | Estrarre IIFE supplier grouping in useMemo |
| UX | `CompanyCostsManager.tsx` | Aggiungere loading state ai pulsanti azione pagamento |
| UX | `CompanyCostsManager.tsx` | Uniformare Tooltip su tutti i pulsanti azione |
| Verifica | `useCashFlowData.ts` | Confermare che le query con filter JS funzionino correttamente |
| Verifica | `ForecastSupplierPayments.tsx` | Confermare rendering corretto con dati reali |
| Verifica | `ForecastTransactionsTable.tsx` | Confermare badge fornitori nella tabella transazioni |
| Verifica | `ForecastChart.tsx` | Confermare barra "Fornitori" nel grafico |

---

## 5) Output Atteso

Dopo l'implementazione:
- **Cose rimosse**: IIFE inline sostituito con useMemo (pulizia, non rimozione file)
- **Bug corretti**: 2 fix (supplier_id + validazione importo)
- **UX migliorata**: loading state pulsanti, tooltip uniformi
- **Test finale**: verifica completa del flusso costi -> previsionale -> grafico -> tabella transazioni

Nessun file verra' rimosso, nessun componente eliminato. Le modifiche sono tutte interne a `CompanyCostsManager.tsx` con verifiche di integrita' sugli altri componenti.
