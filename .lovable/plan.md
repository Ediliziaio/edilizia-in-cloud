

## Piano: Trasformare il modulo fatturazione in sistema di integrazione (stile Agicap)

### Concetto
Il modulo non deve più permettere la creazione/modifica di fatture. Deve solo **importare fatture dai provider esterni** (Fatture in Cloud, Fattura24, ecc.), visualizzarle in sola lettura, e monitorarne lo stato. Come Agicap: connetti il tuo gestionale → le fatture si sincronizzano automaticamente → le verifichi e monitori.

### Modifiche previste

**1. Rimuovere la creazione fatture**
- `InvoicesList.tsx`: Rimuovere il bottone "Nuova Fattura". Rimuovere le azioni "Elimina" e "Modifica" dal dropdown. Mantenere solo "Visualizza", "Segna come pagata" e "Duplica" → anche "Duplica" va rimosso.
- `App.tsx`: Rimuovere la route `fatturazione/nuova`. La route `fatturazione/:id` diventa solo visualizzazione.

**2. Trasformare InvoiceEditor in InvoiceDetail (sola lettura)**
- Rinominare in `InvoiceDetail.tsx` — vista read-only della fattura importata.
- Mostrare tutti i dati (cliente, righe, totali, stato SDI) senza form editabili.
- Mantenere i bottoni "Scarica PDF" e "Invia via Email".
- Aggiungere sezione "Stato sincronizzazione" con ultimo sync, provider, external_id.

**3. Nuovo Edge Function: `billing-import` (pull fatture)**
- Crea una funzione che chiama le API dei provider per **importare/sincronizzare** le fatture nell'app.
- Usa gli adapter esistenti in `billingAdapter.ts` — aggiungere metodo `fetchInvoices(fromDate, toDate)` a ogni adapter.
- Salva le fatture importate nella tabella `invoices` con `external_provider` e `external_id`.

**4. Aggiornare InvoicesList**
- Aggiungere bottone "Sincronizza" che invoca `billing-import` per importare fatture dal provider connesso.
- Mostrare indicatore "ultima sincronizzazione" e provider di origine per ogni fattura.
- Aggiungere badge/icona che indica la provenienza (es. logo Fatture in Cloud).

**5. Widget connessione rapida**
- Se nessun provider è connesso, mostrare un banner prominente "Connetti il tuo gestionale di fatturazione" con link alle impostazioni integrazioni.

**6. Pulizia routing e sidebar**
- Rimuovere route `/azienda/fatturazione/nuova` da `App.tsx`.
- La sidebar resta invariata (Fatturazione, Scadenzario, Report restano utili per monitoraggio).

### File coinvolti
| File | Azione |
|------|--------|
| `src/pages/azienda/billing/InvoicesList.tsx` | Rimuovere creazione, aggiungere sync |
| `src/pages/azienda/billing/InvoiceEditor.tsx` | Trasformare in vista read-only |
| `src/App.tsx` | Rimuovere route `/nuova` |
| `supabase/functions/_shared/billingAdapter.ts` | Aggiungere `fetchInvoices` agli adapter |
| `supabase/functions/billing-import/index.ts` | Nuovo — importa fatture dai provider |

