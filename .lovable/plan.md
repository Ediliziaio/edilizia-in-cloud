

# Verifica Billing Fixes — Stato Attuale e Gap Residui

## Checklist dei 11 punti vs stato corrente

| # | Area | Stato | Dettaglio |
|---|------|-------|-----------|
| 1 | Test connessione | **DONE** | `billing-connect` legge `action` da query string + body fallback (righe 26-34) |
| 2 | Sicurezza webhook | **DONE** | `billing-webhook` verifica `BILLING_WEBHOOK_SECRET` via header/query/HMAC, logga tentativi invalidi |
| 3 | Coerenza "segna come pagata" | **DONE** | Trigger DB `trg_update_invoice_on_payment` aggiorna `paid_amount`, `payment_date`, `status` automaticamente |
| 4 | Scelta provider per sync | **DONE** | `billing-sync` usa `is_primary` + fallback deterministico con `.order("created_at")` |
| 5 | Configurazione provider server-side | **DONE** | `addMutation` in `SettingsBilling.tsx` usa `billing-connect` per API key/bearer providers |
| 6 | Sync stato pagamento | **NON FATTO** | `billing-import` non mappa lo stato pagamento dai provider (vedi sotto) |
| 7 | Log errori di sincronizzazione | **DONE** | `billing-import` catch scrive in `billing_integrations` + `billing_sync_log` |
| 8 | Atomicita update fattura + righe | **DONE** | `updateInvoiceLinesAtomically()` con backup + rollback |
| 9 | Coerenza lista/dettaglio/PDF | **OK** | Fonte di verita e la tabella `invoices`, usata sia in lista che dettaglio. Il trigger mantiene `paid_amount` coerente |
| 10 | Provider primario atomico | **DONE** | `billing-connect` `set_primary`: prima set new, poi unset others |
| 11 | Robustezza generale | **PARZIALE** | Vedi gap sotto |

## Gap residui da correggere

### Gap A: `setPrimaryMutation` nel frontend bypassa il backend
**File:** `src/pages/azienda/settings/SettingsBilling.tsx` righe 118-128
Il frontend usa ancora due query dirette al DB (`update is_primary=false` + `update is_primary=true`) invece di invocare `billing-connect?action=set_primary`. Questo bypassa la logica atomica gia implementata nel backend e crea rischio di stato inconsistente.

**Fix:** Sostituire con `supabase.functions.invoke("billing-connect", { body: { action: "set_primary", provider } })`

### Gap B: `deleteMutation` e `toggleActiveMutation` bypassano il backend
**File:** `src/pages/azienda/settings/SettingsBilling.tsx` righe 106-138
- `deleteMutation` fa `delete` diretto su `billing_integrations` — dovrebbe usare `billing-connect?action=disconnect`
- `toggleActiveMutation` aggiorna `is_active` direttamente — nessuna validazione server

**Fix:** Usare `billing-connect?action=disconnect` per la rimozione (gia implementato nel backend). Per toggle active, mantenere diretto (non c'e validazione necessaria).

### Gap C: Sync stato pagamento dai provider (punto 6)
**File:** `supabase/functions/billing-import/index.ts`
Fatture in Cloud espone `is_paid` e `payment_date` nei documenti. Attualmente l'import non mappa questi campi. Se una fattura risulta pagata sul provider, il sistema non riflette questo stato.

**Fix:** Nel mapping FIC, leggere `doc.payment_accounts` / `doc.payments_sum` e, se la fattura risulta pagata, impostare `status: "paid"` e `paid_amount` nel record importato.

### Gap D: Trigger DB non gestisce UPDATE su `invoice_payments`
**File:** `supabase/migrations/20260310173919_...sql`
Il trigger e solo su `AFTER INSERT OR DELETE`. Se un pagamento viene aggiornato (es. correzione importo), il trigger non scatta.

**Fix:** Aggiungere `OR UPDATE` al trigger.

## Piano di intervento

### Task 1: Frontend — usare edge function per set_primary e disconnect
Modificare `SettingsBilling.tsx`:
- `setPrimaryMutation`: invocare `billing-connect` con `action: "set_primary"` e il `provider` dell'integrazione
- `deleteMutation`: invocare `billing-connect` con `action: "disconnect"` e il `provider`

### Task 2: Import — mappare stato pagamento FIC
In `billing-import/index.ts` `fetchFICInvoices()`:
- Leggere `doc.is_marked` (o `doc.payment_accounts`) per determinare se pagata
- Se pagata, impostare `status: "paid"` e `paid_amount: doc.amount_gross`
- Per altri provider dove il dato non e disponibile, lasciare invariato

### Task 3: Trigger DB — aggiungere UPDATE
Nuova migration: aggiungere `OR UPDATE` al trigger `trg_update_invoice_on_payment`

## File da modificare (totale: 3)

| File | Modifica |
|------|----------|
| `src/pages/azienda/settings/SettingsBilling.tsx` | setPrimaryMutation + deleteMutation via edge function |
| `supabase/functions/billing-import/index.ts` | Mapping stato pagamento FIC |
| DB Migration | Trigger con UPDATE |

## Rischi e mitigazioni

- **setPrimary/disconnect via edge function**: la UX resta identica, solo il backend cambia. Il backend gia gestisce entrambe le action.
- **Mapping pagamento FIC**: conservativo — solo se `doc.payments_sum` > 0 o `doc.is_marked`, altrimenti logica attuale invariata.
- **Trigger UPDATE**: nessun impatto su flussi esistenti, copre solo il caso edge di modifica importo pagamento.

