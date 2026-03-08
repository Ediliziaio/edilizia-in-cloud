

## Analisi Documento vs Codice — Gap Rimanenti

Il documento elenca 7 fix (+ 3 sotto-fix). Ecco lo stato reale dopo le sessioni precedenti:

### Gia Implementati

| # | Fix | Stato |
|---|-----|-------|
| 1 | Tab Email in AdminSettings | ✅ Implementato come pagina dedicata `/admin/impostazioni/email` con sidebar link — approccio migliore |
| 6 | stripe_customer_id su companies | ✅ Colonna esiste gia (migration `20260213`) |
| 7 | send-email-campaign batching | ✅ Implementato con batch di 5 + Promise.all |

### Da Implementare

| # | Fix | Descrizione |
|---|-----|-------------|
| 2 | SettingsCredits — Acquisto pacchetti Stripe | Aggiungere sezione pacchetti email (4 card) con Stripe Checkout |
| 3 | SettingsCredits — Auto top-up toggle | Card con Switch, soglia, importo, salvataggio su `company_auto_topup` |
| 4 | process-automation: crediti + tracking | Nel case `send_email`, detrarre crediti per stream marketing e iniettare tracking pixel |
| 5 | EmailDashboard: costo/margine superadmin | 3 KPI finanziarie (Ricavi Lordi, Costo Provider, Margine Netto) |
| 3b | Edge function auto-topup-check | Nuova edge function che verifica soglia e addebita via Stripe off-session |
| 6b | Stripe webhook salva payment_method | Nel `checkout.session.completed`, salvare PM su `company_auto_topup` |

### Prerequisito Critico

**STRIPE_SECRET_KEY non e configurata nei secrets del progetto.** Le funzionalità Stripe (acquisto pacchetti, auto top-up) non funzioneranno finché l'utente non la configura. Chiederemo all'utente di inserirla prima di procedere, oppure implementiamo il codice e l'utente la configurerà dopo.

---

### Piano di Implementazione

#### 1. SettingsCredits.tsx — Pacchetti + Auto Top-up UI
- Sotto il tab "Riepilogo", aggiungere:
  - **Sezione Pacchetti**: griglia 4 card (€10, €25, €50, €100) con prezzo per email calcolato da `platform_settings` chiave `credits_email_price_per_email`
  - Pulsante "Acquista" che chiama `create-checkout-session` (adattata per accettare `type: 'email_credits'`)
  - Gestione query param `?payment=success` per toast di conferma
  - **Sezione Auto Top-up**: Card con Switch, input soglia/importo, salvataggio su `company_auto_topup`
  - Query per leggere configurazione esistente da `company_auto_topup`

#### 2. create-checkout-session — Supporto email_credits
- Aggiungere branch per `type === 'email_credits'`: crea sessione Stripe in mode `payment` (non subscription) con amount passato

#### 3. stripe-webhook — Gestione email_credits + salvataggio PM
- Nel case `checkout.session.completed`, se `metadata.type === 'email_credits'`:
  - Accreditare crediti via RPC `add_email_credits_with_log`
  - Salvare `payment_method` su `company_auto_topup` per abilitare auto-topup futuro

#### 4. auto-topup-check — Nuova Edge Function
- File: `supabase/functions/auto-topup-check/index.ts`
- Legge config da `company_auto_topup`, verifica soglia, debounce 5 min, esegue PaymentIntent off-session via Stripe API, accredita via `add_email_credits_with_log`

#### 5. process-automation send_email — Crediti + Tracking
- Nel case `send_email` (riga 650+):
  - Se `stream === 'marketing'`: detrarre 1 credito via `deductEmailCredits()`
  - Iniettare tracking pixel e link unsubscribe nell'HTML prima dell'invio
  - Dopo l'invio: fire-and-forget `auto-topup-check`

#### 6. EmailDashboard — KPI Costo/Margine
- Leggere `credits_email_provider_cost` da `platform_settings`
- Calcolare: Costo Provider = total_sent × costPerEmail, Margine = Ricavi - Costo
- Aggiungere 3 card finanziarie nella riga KPI (Ricavi, Costo Provider, Margine %)

