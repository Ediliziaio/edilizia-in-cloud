

# Stabilizzazione, Pulizia e Miglioramento UX - Sezione Costi e Previsionale

## 1) Pulizia Codice - Elementi da Rimuovere

### `CompanyCostsManager.tsx`
- **Import inutilizzato**: `getVatRateLabel` importato da `@/lib/vatUtils` ma mai usato nel file. Da rimuovere dall'import.

Non sono stati trovati altri componenti, file o funzioni morti nel perimetro analizzato. Il codice e' complessivamente ben strutturato.

---

## 2) Fix Funzionali

### Bug 1: Query `company_costs` senza filtro `company_id`
**File**: `CompanyCostsManager.tsx`, riga 178-186

La query principale dei costi non filtra per `company_id`. Se un utente ha accesso, potrebbe vedere costi di altre aziende (protetto solo da RLS, ma la query dovrebbe essere esplicita per efficienza e chiarezza).

**Fix**: Aggiungere `.eq("company_id", companyId)` alla query.

### Bug 2: Query `suppliers-for-costs` senza filtro `company_id`
**File**: `CompanyCostsManager.tsx`, riga 189-200

Stessa problematica: i fornitori vengono caricati senza filtro azienda.

**Fix**: Aggiungere `.eq("company_id", companyId)` alla query.

### Bug 3: Query `orders-for-costs` senza filtro `company_id`
**File**: `CompanyCostsManager.tsx`, riga 238-250

Ordini caricati senza filtro azienda.

**Fix**: Aggiungere `.eq("company_id", companyId)` alla query.

### Bug 4: Query `order-item-costs` senza filtro `company_id` lato DB
**File**: `CompanyCostsManager.tsx`, riga 203-214

Usa `!inner` su orders ma non filtra per company_id nel query. Si basa solo su RLS.

**Fix**: Aggiungere filtro esplicito tramite la relazione inner join (gia' protetto da RLS, ma e' best practice).

### Bug 5: `editingCost` tipizzato come `any`
**File**: `CompanyCostsManager.tsx`, riga 154

Uso di `any` per lo stato `editingCost`. Non causa crash ma riduce la type safety.

**Fix**: Tipizzare come `UnifiedCost | null` o il tipo corretto dal DB.

### Bug 6: Assenza di `company_id` nel filtro `orderItemCosts`
**File**: `CompanyCostsManager.tsx`, riga 203-214

Il filter JS post-fetch non verifica `company_id`. I dati di altre aziende potrebbero essere scaricati (protetti da RLS ma inefficiente).

**Fix**: Aggiungere `.eq("order.company_id", companyId)` o filtrare in JS come gia' fatto per `supplierPaymentItems`.

---

## 3) Miglioramenti UX

### 3a. Loading state mancante sui pulsanti "Segna pagato" / "Non pagato" nella tabella
I pulsanti "Segna pagato" e "Riporta a non pagato" nelle righe della tabella (riga 853-895) non disabilitano ne' mostrano loading durante le mutation `markPaidMutation`, `markUnpaidMutation`, `markOrderItemPaidMutation`, `markOrderItemUnpaidMutation`.

**Fix**: Aggiungere `disabled={markPaidMutation.isPending || markUnpaidMutation.isPending || markOrderItemPaidMutation.isPending || markOrderItemUnpaidMutation.isPending}` ai pulsanti azione.

### 3b. Tooltip mancante sull'icona Info nel riepilogo IVA
L'icona `Info` nel form (riga 1358) non ha tooltip associato.

**Fix**: Wrappare con componente `Tooltip`.

### 3c. Reset form alla chiusura del dialog
Quando si chiude il dialog di creazione/modifica, il form potrebbe mantenere dati stantii se l'utente chiude senza salvare e riapre in modalita' "nuovo".

**Fix**: Aggiungere `onOpenChange` handler che resetta il form quando `open` diventa `false`.

### 3d. Pulsante "Annulla" nel dialog pagamento non resetta lo stato correttamente
Il dialog di pagamento (riga 1448-1477) resetta `payDialogOpen` e `payingCostId` ma non il `paymentDate`. Se l'utente cambia data, annulla e riapre, vedra' la data precedente.

**Fix**: Resettare `paymentDate` a `format(new Date(), "yyyy-MM-dd")` nel handler di chiusura.

---

## 4) Riepilogo Modifiche

| Azione | File | Dettaglio |
|--------|------|-----------|
| Pulizia | `CompanyCostsManager.tsx` | Rimuovere `getVatRateLabel` dall'import |
| Fix | `CompanyCostsManager.tsx` | Aggiungere `.eq("company_id", companyId)` a 3 query (costs, suppliers, orders) |
| Fix | `CompanyCostsManager.tsx` | Aggiungere filter `company_id` al query order_items |
| UX | `CompanyCostsManager.tsx` | Loading state sui pulsanti azione nella tabella |
| UX | `CompanyCostsManager.tsx` | Reset paymentDate alla chiusura del dialog pagamento |
| UX | `CompanyCostsManager.tsx` | Reset form alla chiusura del dialog costo |

---

## 5) Test Finale

Dopo l'implementazione, verifico:
- Apertura pagina /azienda/costi: caricamento corretto, nessun errore console
- Creazione nuovo costo: form si resetta, toast di conferma appare
- Modifica costo: dati precompilati, salvataggio funziona
- Pagamento: dialog si apre, data corretta, salvataggio funziona, riga si aggiorna
- Tab Fornitori: progress bar e tabella visualizzano dati corretti
- Previsionale (/azienda/previsionale): grafico con barra "Fornitori", tabella transazioni con badge
- Filtri: tutti i filtri funzionano senza errori
- Export CSV: file generato correttamente

Nessun file verra' rimosso. Tutte le modifiche sono interne a `CompanyCostsManager.tsx`.

