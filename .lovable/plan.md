

# Piano: Sezione Fatturazione Aziendale

## Stato attuale

- **`SettingsBilling.tsx`** esiste già ma gestisce le **integrazioni con provider di fatturazione** (Fatture in Cloud, Fattura24, ecc.) — NON il piano/abbonamento dell'azienda
- La rotta `/azienda/impostazioni/fatturazione` e il link nel sidebar **esistono già** e puntano a questa pagina
- Il `customer-portal` edge function **esiste già** in `supabase/functions/customer-portal/index.ts`
- Il webhook Stripe gestisce già `invoice.paid` e `invoice.payment_failed` ma **non sincronizza** su una tabella `subscription_invoices`
- **Non esiste** la tabella `subscription_invoices` nel DB
- **Non esiste** la tabella `company_dunning`; il dunning è gestito inline in `companies` (campi `dunning_status`, `dunning_started_at`, `payment_failure_count`)
- `subscription_plans` ha `price_monthly` e `price_yearly` (non `price` o `billing_interval`)

## Implementazione

### 1. DB Migration — tabella `subscription_invoices`
Crea tabella con: `company_id`, `stripe_invoice_id` (UNIQUE), `amount_paid`, `amount_due` (in centesimi), `currency`, `status`, `invoice_url`, `invoice_pdf`, `period_start/end`, `paid_at`, timestamps. RLS: company vede le proprie (via `profiles.company_id`), service_role gestisce tutto. Indici su `company_id` e `stripe_invoice_id`. Trigger `updated_at`.

### 2. Estendere `stripe-webhook/index.ts`
Nei handler `handleInvoicePaid` e `handleInvoicePaymentFailed` esistenti, aggiungere l'upsert nella nuova tabella `subscription_invoices`. Aggiungere nuovo handler `handleInvoiceCreated` per le bozze. Aggiungere il case `invoice.created` nel switch.

### 3. Hook `useBilling.ts`
- **`useBillingInfo()`**: query su `companies` con join a `subscription_plans` per piano corrente, stato, trial, dunning info (da campi `companies`)
- **`useInvoices()`**: query su `subscription_invoices` ordinate per data
- **`useOpenBillingPortal()`**: mutation che invoca il `customer-portal` edge function esistente (aggiornando il `return_url` a `/azienda/impostazioni/abbonamento`)

### 4. Nuova pagina `SettingsSubscriptionBilling.tsx`
Pagina separata da `SettingsBilling.tsx` (che resta per i provider). Contiene:
- **Card Piano Corrente**: nome piano, prezzo, badge stato (trial/active/suspended/expired), banner trial con scadenza, banner dunning con giorni rimasti + link "Paga ora", CTA "Gestisci abbonamento e pagamenti" → Stripe Customer Portal
- **Card Storico Fatture**: tabella con periodo, importo, stato (badge colorati), azioni (download PDF, apri su Stripe, paga per fatture open)
- Nota footer su Stripe per sicurezza

### 5. Rotta e navigazione
- Aggiungere rotta `/azienda/impostazioni/abbonamento` → `SettingsSubscriptionBilling`
- Aggiungere link "Abbonamento" con icona `CreditCard` nel sidebar di CompanyLayout, prima di "Fatturazione" (che resta per le integrazioni provider)

### File impattati
| File | Azione |
|---|---|
| DB migration | Nuova tabella `subscription_invoices` |
| `supabase/functions/stripe-webhook/index.ts` | Upsert fatture nei handler esistenti + nuovo case `invoice.created` |
| `src/hooks/useBilling.ts` | Nuovo file con 3 hooks |
| `src/pages/azienda/settings/SettingsSubscriptionBilling.tsx` | Nuova pagina |
| `src/routes/companyRoutes.tsx` | Nuova rotta |
| `src/components/layouts/CompanyLayout.tsx` | Nuovo link sidebar |

### Note tecniche
- Gli importi Stripe sono in centesimi → divisi per 100 nella visualizzazione con `Intl.NumberFormat`
- Usa `effectiveCompany?.id` per il tenant
- Il dunning usa i campi già esistenti in `companies` (`dunning_status`, `payment_failure_count`) — no tabella separata
- Il `customer-portal` edge function esistente viene riusato, aggiornando solo il `return_url`

