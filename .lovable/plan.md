

# Piano Fase A: Monetizzazione - Piani Tariffari e Pagamenti

## Panoramica

Implementare un sistema completo di monetizzazione per la piattaforma: piani tariffari (Free/Pro/Enterprise), gestione stato abbonamento delle aziende (trial/active/suspended/expired), integrazione Stripe per pagamenti ricorrenti, e un pannello Super Admin per monitorare e gestire tutto.

---

## Architettura del Sistema

```text
+---------------------+       +-------------------+       +------------------+
|   Super Admin UI    |       |   Database         |       |   Stripe         |
|                     |       |                    |       |                  |
| - Gestione Piani   |------>| subscription_plans |       | - Products       |
| - Stato Aziende    |       | company_subs       |<----->| - Prices         |
| - Dashboard MRR    |       | subscription_logs  |       | - Subscriptions  |
| - Override manuale |       | companies (status) |       | - Webhooks       |
+---------------------+       +-------------------+       +------------------+
                                       ^
                                       |
                              +------------------+
                              | Edge Functions   |
                              |                  |
                              | - create-checkout|
                              | - stripe-webhook |
                              | - manage-sub     |
                              +------------------+
```

---

## Step 1: Schema Database

### 1a. Nuova tabella `subscription_plans`

Definisce i piani disponibili (gestiti dal Super Admin).

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| id | uuid PK | Identificativo |
| name | text | "Free", "Pro", "Enterprise" |
| slug | text UNIQUE | "free", "pro", "enterprise" |
| description | text | Descrizione piano |
| price_monthly | numeric | Prezzo mensile (EUR) |
| price_yearly | numeric | Prezzo annuale (EUR) |
| max_orders | integer | Limite ordini (-1 = illimitato) |
| max_users | integer | Limite utenti |
| max_storage_mb | integer | Limite storage MB |
| features | jsonb | Lista funzionalita incluse |
| is_active | boolean | Piano disponibile per nuove iscrizioni |
| stripe_product_id | text | ID prodotto Stripe |
| stripe_price_monthly_id | text | ID prezzo mensile Stripe |
| stripe_price_yearly_id | text | ID prezzo annuale Stripe |
| position | integer | Ordinamento visualizzazione |
| created_at | timestamptz | Data creazione |

### 1b. Nuovi campi su `companies`

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| status | text | 'trial', 'active', 'suspended', 'expired' (default: 'trial') |
| trial_ends_at | timestamptz | Scadenza trial (default: now + 14 giorni) |
| subscription_plan_id | uuid FK | Piano attivo |
| stripe_customer_id | text | ID cliente Stripe |

### 1c. Nuova tabella `company_subscriptions`

Storico e stato corrente degli abbonamenti.

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| id | uuid PK | Identificativo |
| company_id | uuid FK | Azienda |
| plan_id | uuid FK | Piano |
| stripe_subscription_id | text | ID sottoscrizione Stripe |
| billing_period | text | 'monthly' o 'yearly' |
| status | text | 'active', 'past_due', 'canceled', 'trialing' |
| current_period_start | timestamptz | Inizio periodo corrente |
| current_period_end | timestamptz | Fine periodo corrente |
| canceled_at | timestamptz | Data cancellazione |
| created_at | timestamptz | Data creazione |

### 1d. Nuova tabella `subscription_logs`

Audit trail di tutti i cambiamenti di stato.

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| id | uuid PK | Identificativo |
| company_id | uuid FK | Azienda |
| event_type | text | 'trial_started', 'activated', 'suspended', 'canceled', 'renewed', 'plan_changed', 'payment_failed' |
| old_status | text | Stato precedente |
| new_status | text | Nuovo stato |
| plan_id | uuid | Piano coinvolto |
| notes | text | Note aggiuntive |
| performed_by | uuid | Chi ha effettuato il cambio (SA o sistema) |
| created_at | timestamptz | Data evento |

### RLS Policies

- `subscription_plans`: SELECT per tutti gli autenticati, ALL per super_admin
- `company_subscriptions`: ALL per super_admin, SELECT per company_admin della propria azienda
- `subscription_logs`: ALL per super_admin, SELECT per company_admin della propria azienda
- Campi `companies`: protetti dalle policy esistenti

---

## Step 2: Integrazione Stripe

### 2a. Abilitare Stripe

Utilizzare lo strumento integrato di Lovable per abilitare Stripe e configurare la secret key.

### 2b. Edge Function `create-checkout-session`

Crea una sessione di checkout Stripe per un'azienda che vuole attivare/cambiare piano.

- Input: `company_id`, `plan_slug`, `billing_period`
- Logica:
  1. Recupera piano e prezzi Stripe
  2. Crea o recupera Stripe Customer per l'azienda
  3. Crea Checkout Session con `mode: 'subscription'`
  4. Ritorna URL della sessione

### 2c. Edge Function `stripe-webhook`

Gestisce gli eventi Stripe in ingresso:

| Evento Stripe | Azione |
|--------------|--------|
| `checkout.session.completed` | Attiva abbonamento, aggiorna status azienda a 'active' |
| `invoice.paid` | Rinnova periodo, log "renewed" |
| `invoice.payment_failed` | Aggiorna status a 'suspended', log "payment_failed" |
| `customer.subscription.deleted` | Status 'expired', log "canceled" |
| `customer.subscription.updated` | Aggiorna dettagli abbonamento |

### 2d. Edge Function `manage-subscription`

Per azioni manuali del Super Admin:
- Override stato azienda (attiva/sospendi/riattiva)
- Cambio piano forzato
- Estensione trial

---

## Step 3: UI Super Admin

### 3a. Nuova pagina "Piani" (`/admin/piani`)

- Lista piani con prezzi, limiti, stato (attivo/disattivo)
- CRUD piani (nome, prezzo, limiti, features)
- Sincronizzazione automatica con Stripe Products/Prices
- Ordinamento drag-and-drop

### 3b. Nuova pagina "Abbonamenti" (`/admin/abbonamenti`)

- Tabella tutte le aziende con: nome, piano, stato, scadenza, MRR contribuito
- Filtri per stato (trial/active/suspended/expired)
- Azioni rapide: cambia piano, sospendi, riattiva, estendi trial
- Badge colorati per stato

### 3c. Dashboard SA aggiornata

Aggiungere card statistiche:

| Statistica | Descrizione |
|------------|-------------|
| MRR | Monthly Recurring Revenue totale |
| Aziende per stato | Breakdown trial/active/suspended/expired |
| Churn rate | Percentuale cancellazioni ultimo mese |
| Trial in scadenza | Aziende con trial che scade entro 3 giorni |

### 3d. CompanyDetail aggiornato

Nel dettaglio azienda aggiungere sezione "Abbonamento":
- Piano attuale con badge
- Stato abbonamento con colore
- Date periodo corrente
- Storico cambi stato (da subscription_logs)
- Azioni: cambia piano, sospendi, riattiva, estendi trial

### 3e. Sidebar aggiornata

Aggiungere voci di navigazione:
- "Piani" (icona CreditCard)
- "Abbonamenti" (icona Receipt)

---

## Step 4: Enforcement Limiti

### 4a. Hook `useSubscriptionLimits`

Hook React che controlla i limiti del piano attivo per l'azienda corrente:

```text
const { canCreateOrder, canAddUser, remainingOrders, currentPlan } = useSubscriptionLimits();
```

### 4b. Logica di enforcement

- Quando un'azienda tenta di creare un ordine oltre il limite, mostrare un messaggio di upgrade
- Quando lo status e 'suspended' o 'expired', mostrare un banner di avviso nell'area azienda
- Il Super Admin puo sempre operare tramite impersonation indipendentemente dai limiti

---

## Step 5: Flow Completo Azienda

### Trial Flow
1. SA crea azienda -> status = 'trial', trial_ends_at = +14 giorni, piano = Free
2. Azienda lavora normalmente con limiti Free
3. 3 giorni prima della scadenza: banner "Il tuo trial scade tra X giorni"
4. Scadenza trial -> status = 'expired', banner "Trial scaduto, attiva un piano"

### Upgrade Flow
1. Company Admin clicca "Upgrade" dal banner o dalle impostazioni
2. Visualizza pagina piani con prezzi e comparazione
3. Seleziona piano e periodo (mensile/annuale)
4. Redirect a Stripe Checkout
5. Pagamento completato -> webhook -> status = 'active'

### Cancellation Flow
1. Company Admin richiede cancellazione o SA la forza
2. Abbonamento attivo fino a fine periodo
3. Fine periodo -> status = 'expired'

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| Migrazione SQL | Crea | Tabelle subscription_plans, company_subscriptions, subscription_logs + campi companies |
| `supabase/functions/create-checkout-session/index.ts` | Crea | Checkout Stripe |
| `supabase/functions/stripe-webhook/index.ts` | Crea | Gestione webhook Stripe |
| `supabase/functions/manage-subscription/index.ts` | Crea | Azioni manuali SA |
| `src/pages/admin/SubscriptionPlans.tsx` | Crea | CRUD piani tariffari |
| `src/pages/admin/Subscriptions.tsx` | Crea | Lista abbonamenti aziende |
| `src/components/layouts/AdminLayout.tsx` | Modifica | Aggiungere voci sidebar |
| `src/App.tsx` | Modifica | Aggiungere route |
| `src/pages/admin/AdminDashboard.tsx` | Modifica | Card MRR e statistiche |
| `src/pages/admin/CompanyDetail.tsx` | Modifica | Sezione abbonamento |
| `src/pages/admin/CreateCompany.tsx` | Modifica | Selezione piano iniziale |
| `src/types/auth.ts` | Modifica | Aggiungere tipo CompanyStatus |
| `src/hooks/useSubscriptionLimits.ts` | Crea | Hook limiti piano |
| `supabase/functions/create-company/index.ts` | Modifica | Assegnare piano Free e status trial |

---

## Sequenza di Implementazione Consigliata

1. **Schema DB** - Creare tabelle e migrazioni
2. **Stripe** - Abilitare integrazione e configurare secret key
3. **Edge Functions** - Checkout, webhook, manage
4. **UI Piani SA** - CRUD piani tariffari
5. **UI Abbonamenti SA** - Lista e gestione abbonamenti
6. **Dashboard SA** - Statistiche MRR
7. **CompanyDetail** - Sezione abbonamento
8. **Enforcement** - Hook limiti e banner
9. **CreateCompany** - Piano iniziale e trial

Dato il volume di lavoro, si consiglia di procedere per sotto-fasi approvando ogni blocco separatamente.

