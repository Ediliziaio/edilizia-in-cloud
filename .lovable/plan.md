
# Collegamento Metodo di Pagamento per le Aziende

## Panoramica

Attualmente il sistema ha predisposizioni per Stripe (campi `stripe_customer_id` nella tabella `companies` e `stripe_product_id`/`stripe_price_*_id` nei piani) ma nessun flusso di pagamento attivo. Questo intervento aggiunge la possibilita per il Super Admin di configurare il metodo di pagamento di ogni azienda, supportando tre modalita:

1. **Stripe** -- pagamento automatico con carta di credito tramite Stripe Checkout
2. **Bonifico IBAN** -- pagamento manuale su conto corrente con tracciamento
3. **Altro provider** -- campo libero per annotare metodi alternativi (PayPal, Satispay, ecc.)

---

## Cosa vede il Super Admin

### Nuovo blocco "Metodo di Pagamento" nel tab Abbonamento

All'interno di `CompanySubscriptionTab`, tra la card "Stato Abbonamento" e la card "Dati Fatturazione", compare una nuova card:

**Card "Metodo di Pagamento":**
- **Select** con opzioni: `Stripe`, `Bonifico IBAN`, `Altro`, `Non configurato`
- Se **Stripe**: mostra il campo Stripe Customer ID (gia esistente), piu un bottone "Genera Link Pagamento" che creera una Checkout Session Stripe
- Se **Bonifico IBAN**: mostra campi per IBAN, intestatario conto, nome banca, e causale suggerita. Mostra lo stato del pagamento corrente (pagato/in attesa)
- Se **Altro**: campo di testo libero per annotare il provider e dettagli

---

## Modifiche al Database

### Nuove colonne nella tabella `companies`:

| Colonna | Tipo | Default | Note |
|---------|------|---------|------|
| `payment_method` | text | `'none'` | Valori: `stripe`, `bank_transfer`, `other`, `none` |
| `bank_iban` | text | null | IBAN per bonifico |
| `bank_account_holder` | text | null | Intestatario conto |
| `bank_name` | text | null | Nome banca |
| `payment_notes` | text | null | Note/dettagli per "Altro" |

Nessuna nuova tabella. Le colonne si aggiungono alla tabella `companies` gia protetta da RLS.

---

## Flusso Stripe (Checkout Session)

### Nuova Edge Function: `create-checkout-session`

Quando il Super Admin clicca "Genera Link Pagamento":

1. L'edge function riceve `company_id` e `plan_id`
2. Verifica che l'utente sia super_admin
3. Crea o recupera il Stripe Customer (usando `stripe_customer_id` o creandone uno nuovo)
4. Crea una Checkout Session con il `stripe_price_monthly_id` o `stripe_price_yearly_id` del piano
5. Ritorna l'URL della Checkout Session
6. Il Super Admin puo copiare l'URL e inviarlo all'azienda, oppure aprirlo direttamente

### Nuova Edge Function: `stripe-webhook`

Riceve gli eventi da Stripe e aggiorna automaticamente:
- `checkout.session.completed` -- attiva l'abbonamento, salva `stripe_customer_id`
- `invoice.paid` -- rinnovo andato a buon fine, aggiorna `current_period_end`
- `customer.subscription.deleted` -- abbonamento cancellato, status diventa `expired`

### Prerequisito: Chiave Stripe

Prima di implementare le edge functions Stripe, sara necessario configurare la chiave segreta Stripe (`STRIPE_SECRET_KEY`) tramite i secrets del progetto. Il flusso Stripe funzionera solo dopo aver inserito questa chiave.

---

## Flusso Bonifico IBAN

Nessuna integrazione esterna. Il Super Admin:

1. Seleziona "Bonifico IBAN" come metodo di pagamento
2. Compila i dati bancari dell'azienda SaaS (il conto su cui l'azienda cliente deve pagare)
3. I dati vengono salvati nella tabella `companies`
4. Il Super Admin puo poi tracciare manualmente se il bonifico e stato ricevuto tramite lo stato nel tab Abbonamento

---

## Dettagli Tecnici

### Migrazione database:
```sql
ALTER TABLE companies
ADD COLUMN payment_method text NOT NULL DEFAULT 'none',
ADD COLUMN bank_iban text,
ADD COLUMN bank_account_holder text,
ADD COLUMN bank_name text,
ADD COLUMN payment_notes text;
```

### File modificati:

**`src/types/auth.ts`** -- Aggiungere i nuovi campi all'interfaccia `Company`:
- `payment_method`, `bank_iban`, `bank_account_holder`, `bank_name`, `payment_notes`

**`src/components/admin/company/CompanySubscriptionTab.tsx`** -- Aggiungere la card "Metodo di Pagamento" con:
- Select per il tipo di metodo
- Form condizionale per Stripe / IBAN / Altro
- Bottone salva per i dati di pagamento
- Bottone "Genera Link Pagamento" per Stripe

**`src/hooks/useCompanyDetail.ts`** -- Aggiungere:
- Mutation `updatePaymentMethod` per salvare metodo + dati bancari
- Mutation `createCheckoutSession` per invocare la edge function Stripe

**`supabase/functions/create-checkout-session/index.ts`** -- Nuova edge function:
- Validazione super_admin
- Creazione/recupero Stripe Customer
- Creazione Checkout Session
- Ritorno URL

**`supabase/functions/stripe-webhook/index.ts`** -- Nuova edge function:
- Validazione firma webhook Stripe
- Gestione eventi: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
- Aggiornamento stato azienda e subscription

### File nuovi:
- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/stripe-webhook/index.ts`

### Config Supabase:
Aggiunta in `supabase/config.toml`:
```toml
[functions.create-checkout-session]
verify_jwt = false

[functions.stripe-webhook]
verify_jwt = false
```

---

## Ordine di implementazione

1. Migrazione database (nuove colonne)
2. Aggiornamento tipo `Company` in `auth.ts`
3. Card "Metodo di Pagamento" nel tab Abbonamento (IBAN + Altro funzionanti subito)
4. Richiesta chiave Stripe al utente
5. Edge function `create-checkout-session`
6. Edge function `stripe-webhook`
7. Integrazione bottone "Genera Link" nel frontend
