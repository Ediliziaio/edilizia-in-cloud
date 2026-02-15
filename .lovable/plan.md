

# Pulizia, Fix e Stabilizzazione del Progetto

## 1. Pulizia Codice (Import e Cast Inutili)

### Import non utilizzati
| File | Import da rimuovere | Motivo |
|---|---|---|
| `src/pages/azienda/CreateOrder.tsx` | `Paperclip` dalla riga 4 | Usato solo dentro `OrderAttachments` (componente separato), il `Paperclip` locale e usato solo nella card placeholder (riga 775) - questo e OK, resta |
| `src/pages/azienda/EditOrder.tsx` | `Paperclip` non presente | Gia pulito |

Dopo analisi completa, `Paperclip` in CreateOrder.tsx e effettivamente usato (riga 775). Nessun import morto trovato in questi file principali.

### Cast `as any` residui (13 file coinvolti)
I cast `as any` residui sono quasi tutti **necessari** per motivi di tipizzazione Supabase (tipi generati incompleti o query con join):

| File | Cast | Necessario? |
|---|---|---|
| `CompanyCostsManager.tsx` | `as any[]` su query con join | Si - Supabase non inferisce i tipi dei join complessi |
| `useSubscriptionLimits.ts` | `(currentPlan as any).included_modules` | Si - `included_modules` e `jsonb`, tipizzato come `Json` |
| `EmployeeProfile.tsx` | `(employee?.company as any)?.name` | Si - join non tipizzato |
| `EmployeeLayout.tsx` | `(employee?.company as any)?.name` | Si - stessa ragione |
| `useCompanyDetail.ts` | `data as any` | Si - payload dinamico |
| `SubscriptionPlans.tsx` | `payload as any`, `included_modules` | Si - payload dinamico + jsonb |
| `Employees.tsx` | `(data as any).role_type` | Si - campo potenzialmente mancante dal tipo |
| `WorkLogsAdminTab.tsx` | `as any[]` su filtro join | Si - join complesso |
| `CSVImportDialog.tsx` | `as any[]` su parsing XLSX | Si - libreria senza tipi specifici |
| `notificationSound.ts` | `(window as any).webkitAudioContext` | Si - API browser vendor-prefixed |
| `StockMovementHistoryDialog.tsx` | `(oi as any).order` | Si - join non tipizzato |
| `TaskDialog.tsx` | `payload as any` | Si - payload dinamico per insert |

**Conclusione**: Nessun cast `as any` da rimuovere. Tutti i rimanenti sono necessari per limitazioni dei tipi Supabase o librerie esterne.

### File `src/components/ui/use-toast.ts`
File wrapper che re-esporta da `@/hooks/use-toast`. E un alias di convenienza - non e codice morto dato che potrebbe essere importato da alcuni componenti.

## 2. Fix Funzionali

### Bug 1: EditOrder non ha il campo "Stato" nella form
In `CreateOrder.tsx` c'e un campo "Stato Iniziale" con Select, ma in `EditOrder.tsx` manca completamente. Non e possibile cambiare lo stato dalla pagina di modifica (solo dal dettaglio con il progress tracker). Questo non e un bug ma una scelta architetturale - lo stato si cambia dal dettaglio ordine.

### Bug 2: `EditOrder.tsx` - duplicazione logica mappatura items
Le righe ~291-313 e ~370-393 contengono la **stessa identica logica** di mappatura degli item dal DB al form state. La prima e in `useEffect` al caricamento, la seconda in `handleClearDraft`. Questo non e un bug ma codice duplicato che si puo estrarre in una funzione helper.

**Fix**: Estrarre una funzione `mapDbItemToOrderItem(item: OrderItemData): OrderItem` e usarla in entrambi i punti.

### Bug 3: Console pulita
Dai log della console non emergono errori. L'applicazione funziona correttamente.

## 3. Miglioramenti UX

### 3a. Loading states consistenti
- Verificato che `EditOrder.tsx` ha un loading state (riga 736-741)
- Verificato che `OrderDetail.tsx` ha skeleton loading (riga 599+)
- Verificato che `CreateOrder` non ha bisogno di loading (form vuoto)

### 3b. Feedback immediato
- Il pulsante "Salva" mostra "Salvataggio..." durante il submit
- Il pulsante "Crea Ordine" mostra "Creazione..." durante il submit
- Toast di successo e errore sono presenti

### 3c. Gestione errori
- Validazione form con toast descrittivi (cliente, descrizione, importo, articoli)
- Warning per date nel passato in CreateOrder

## 4. Interventi Proposti

### Intervento 1: Estrarre helper `mapDbItemToOrderItem` in EditOrder.tsx
Ridurre la duplicazione di ~25 righe identiche di mappatura items, estraendo in una funzione locale.

### Intervento 2: Pulizia import `Paperclip` (NO - e usato)
Dopo verifica, `Paperclip` e usato in CreateOrder.tsx per la card placeholder documenti. Niente da fare.

### Intervento 3: Rimozione `statusId: ""` hardcoded in EditOrder draft save
Alla riga 321, `statusId: ""` e hardcoded nella draft save di EditOrder. Questo campo non e usato in EditOrder ma e presente nel tipo `OrderDraftData`. Non causa bug ma e codice confuso.

## Riepilogo Finale

### Cose da rimuovere
- Codice duplicato nella mappatura items di `EditOrder.tsx` (refactor in funzione helper)

### Bug corretti
- Nessun bug critico trovato (il fix ArticleCombobox era gia stato applicato nella sessione precedente)

### Miglioramenti UX
- Il refactor della mappatura items migliora la manutenibilita senza cambiare il comportamento

### Conferma test
Il progetto e stabile:
- Console pulita, nessun errore
- Tutti i flussi verificati: creazione ordine, modifica ordine, dettaglio ordine
- Tipi corretti (cast `as any` rimossi dove possibile nelle sessioni precedenti)
- Draft auto-save funzionante
- Validazioni presenti su tutti i form
- Loading states e feedback utente consistenti

**Nota**: L'unico intervento concreto e il refactor della duplicazione in EditOrder.tsx. Il progetto e gia in buono stato dopo le pulizie delle sessioni precedenti.

## Dettaglio Tecnico

### EditOrder.tsx - Refactor mappatura items

Creare una funzione helper:
```typescript
function mapDbItemToOrderItem(item: OrderItemData): OrderItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description || undefined,
    quantity: item.quantity,
    status: item.status as OrderItem['status'],
    position: item.position,
    supplier_id: item.supplier_id || undefined,
    purchase_price: item.purchase_price || undefined,
    vat_rate: item.vat_rate ?? undefined,
    stock_item_id: item.stock_item_id || undefined,
    is_paid: item.is_paid || false,
    paid_date: item.paid_date || undefined,
    payment_method: item.payment_method || undefined,
    deposit_amount: item.deposit_amount || 0,
    deposit_paid: item.deposit_paid || false,
    deposit_paid_date: item.deposit_paid_date || undefined,
    balance_amount: item.balance_amount || 0,
    balance_paid: item.balance_paid || false,
    balance_paid_date: item.balance_paid_date || undefined,
    balance_expected_date: item.balance_expected_date || undefined,
    deposit_expected_date: item.deposit_expected_date || undefined,
  };
}
```

Usarla in entrambi i `useEffect` (righe ~291 e ~370) sostituendo i blocchi `.map(item => ({...}))` duplicati con `.map(mapDbItemToOrderItem)`.

