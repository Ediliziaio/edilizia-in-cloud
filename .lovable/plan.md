

# Audit Completo: Domus Group S.r.l. - Bug, Problemi e Codice Inutilizzato

## Bug Identificati

### 1. BUG CRITICO: Banner "Rimangono null giorni"
**File**: `src/components/layouts/SubscriptionBanner.tsx`
**Problema**: Quando il Super Admin accede a `/azienda` senza impersonare un'azienda, `effectiveCompany` e null ma `SubscriptionBanner` viene comunque renderizzato. Il valore `trialDaysLeft` risulta `null` e il messaggio diventa "Rimangono null giorni".
**Fix**: Aggiungere un check: se `effectiveCompany` e null, il banner non deve essere visualizzato.

### 2. BUG: Warning React - forwardRef su OrdersTable
**File**: `src/components/orders/OrdersTable.tsx`
**Problema**: Console warning "Function components cannot be given refs" nella pagina Ordini. Il componente `OrdersTable` e `AlertDialog` annidato non supportano ref ma qualcosa tenta di passarne uno.
**Fix**: Non critico ma da risolvere per pulizia console.

### 3. BUG POTENZIALE: Query `tickets` nella Dashboard
**File**: `src/pages/azienda/CompanyDashboard.tsx`
**Problema**: La dashboard conta i ticket con `.eq("status", "aperto")`, ma la tabella `tickets` non ha RLS policy per `company_admin` o `company_staff` (solo `super_admin` ha policy visibile nel contesto fornito). Verificare che le RLS permettano al company admin di leggere i propri ticket.

## Problemi di Qualita del Codice

### 4. Cast `as any` nel EditOrder.tsx e OrderDetail.tsx
**File**: `src/pages/azienda/EditOrder.tsx` (righe 325-329, 399-403)
**Problema**: I campi `financing_paid`, `financing_cost`, `financing_paid_date`, `financing_expected_date`, `has_building_bonus` sono accessibili tramite `(order as any)` perche l'interfaccia `OrderData` non include tutti i campi.
**Fix**: Aggiornare l'interfaccia `OrderData` per includere `financing_paid`, `financing_paid_date`, `financing_expected_date`, `financing_cost`, `has_building_bonus`.

### 5. Interfaccia `OrderDetail` incompleta in OrderDetail.tsx
**File**: `src/pages/azienda/OrderDetail.tsx` (riga 121-155)
**Problema**: L'interfaccia `OrderDetail` non include `deposit_expected_date`, `deposit_2_expected_date`, `financing_amount`, `financing_paid`, `financing_expected_date`, `financing_cost`, `has_building_bonus`, `payment_type`, `order_code`, `vat_rate`. Il componente usa `order` con cast impliciti che nascondono errori.

## Codice Non Utilizzato da Rimuovere

### 6. NESSUN file completamente inutilizzato
Dopo un'analisi approfondita, tutti i file presenti nel progetto sono effettivamente utilizzati:
- `NavLink.tsx` - usato in tutti i layout
- `ColorPicker.tsx` e `IconPicker.tsx` - usati in `StatusItem.tsx`
- `LeadTimeStats.tsx` - usato in `CalendarGanttView.tsx`
- `DateRangeFilter.tsx` - usato in `OrdersFilters.tsx` e `ForecastTransactionsTable.tsx`
- `notificationSound.ts` - usato in `AdminSupportChatSheet.tsx` e `SupportChatSheet.tsx`
- `Employees.tsx` - non ha una route dedicata ma e importato e usato come componente embedded in `Settings.tsx`

Il codebase e pulito dal punto di vista dei file inutilizzati.

## Piano di Implementazione

### Modifiche da fare:

1. **Fix SubscriptionBanner** - Aggiungere `if (!effectiveCompany) return null;` all'inizio del componente

2. **Fix interfaccia OrderData in EditOrder.tsx** - Aggiungere i campi mancanti (`financing_paid`, `financing_paid_date`, `financing_expected_date`, `financing_cost`, `has_building_bonus`) e rimuovere tutti i cast `as any`

3. **Fix interfaccia OrderDetail in OrderDetail.tsx** - Aggiungere i campi mancanti (`deposit_expected_date`, `deposit_2_expected_date`, etc.) per type safety completa

### File da modificare:
- `src/components/layouts/SubscriptionBanner.tsx` - Fix banner null
- `src/pages/azienda/EditOrder.tsx` - Fix interfaccia OrderData, rimuovere cast `as any`
- `src/pages/azienda/OrderDetail.tsx` - Fix interfaccia OrderDetail

### Nessun file da eliminare
L'analisi ha confermato che tutti i file del progetto sono in uso.

