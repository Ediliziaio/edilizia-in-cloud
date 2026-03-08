

## Ri-analisi Completa: Documento vs Implementazione — Stato Aggiornato

### Legenda
- ✅ = Implementato e funzionante
- ⚠️ = Parziale o con differenze
- ❌ = Non implementato

---

### PARTE 0 — Architettura e Shared Libraries

| Elemento | Stato | Note |
|---|---|---|
| `_shared/emailProvider.ts` — 5 provider | ✅ | SendGrid, Brevo, Resend, Elastic Email, Mailgun |
| `_shared/emailProvider.ts` — `loadProviderSettings(stream)` | ✅ | Chiavi `email_marketing_*` / `email_transactional_*` |
| `_shared/emailProvider.ts` — tracking nativo disabilitato | ✅ | SendGrid tracking_settings + Mailgun o:tracking |
| `_shared/emailProvider.ts` — supporto attachments | ✅ | |
| `_shared/emailCredits.ts` — deduct/add/getBalance/checkAutoTopup | ✅ | |
| `_shared/getPlatformSetting.ts` | ✅ | |
| **Discrepanza: sistema EUR vs crediti interi** | ⚠️ | Il DB usa `balance_eur` (float). Il documento prevede crediti interi (1 credito = 1 email). Tuttavia `send-email-campaign` usa `recipients.length` come costo, quindi funzionalmente 1 credito = 1 email anche se il campo si chiama `_eur`. Non critico ma naming inconsistente. |

---

### PARTE 1 — Pannello SuperAdmin: Tab Email

| Elemento | Stato | Note |
|---|---|---|
| Tab Email in AdminSettings con 3 sub-tab | ✅ | Provider, Prezzi, Dashboard |
| Provider Marketing: select, API key, from address | ✅ | |
| Provider Marketing: from_name, domain (Mailgun) | ✅ | |
| Provider Marketing: webhook URL read-only + copy | ✅ | |
| Provider Marketing: badge stato (Connesso/Errore/Non configurato) | ✅ | Con data ultimo test |
| Provider Transazionale: stesse feature | ✅ | |
| Nota informativa transazionale | ✅ | Alert blu con spiegazione |
| Prezzi & Margini: markup globale | ✅ | |
| Prezzi & Margini: tabella tariffe per provider | ✅ | |
| Prezzi & Margini: bonus signup | ✅ | |
| Dashboard: KPI piattaforma (invii, aperture, click, bounce) | ✅ | |
| Dashboard: selettore periodo (oggi/7d/30d/tutto) | ✅ | |
| Dashboard: top 10 aziende via RPC | ✅ | Usa `get_top_companies_by_email` |

---

### PARTE 2 — Sezione Crediti Azienda

| Elemento | Stato | Note |
|---|---|---|
| Pagina `SettingsCredits.tsx` | ✅ | Route `/azienda/impostazioni/crediti` |
| Riepilogo multi-wallet (Email, AI, WhatsApp) | ✅ | 3 card + saldo totale |
| Usage bar per wallet | ✅ | |
| Storico movimenti email (tabella) | ✅ | Da `email_credits_log` |
| Sidebar link "Crediti & Saldo" | ✅ | |
| **Acquisto pacchetti crediti con Stripe** | ❌ | Nessuna UI per acquisto pacchetti |
| **Auto Top-up con Stripe SetupIntent** | ❌ | Tabella `company_auto_topup` esiste, ma nessuna UI toggle/soglia/metodo pagamento |
| `auto-topup-check` edge function | ❌ | |
| `topup-credits` con prezzo dinamico da platform_settings | ❌ | Non gestisce email credits |
| `stripe-webhook` per email credits | ❌ | Non gestisce purchase email credits |

---

### PARTE 3 — Invio Campagne e Tracking

| Elemento | Stato | Note |
|---|---|---|
| `send-email-campaign` edge function | ✅ | Bulk send con personalizzazione, tracking pixel, click wrap, unsubscribe header, credit deduction, segmentazione |
| `email-tracking` edge function | ✅ | Open pixel, click redirect, unsubscribe con pagina HTML |
| `email-provider-webhook` edge function | ✅ | Normalizzazione 5 provider (SendGrid, Brevo, Elastic, Mailgun, Resend) |
| `send-test-email` con testMode | ✅ | |
| `CampaignSendSettings.tsx` invoca `send-email-campaign` | ✅ | |
| `CampaignSendSettings.tsx` widget saldo crediti | ✅ | Mostra balance e stima costo |

---

### PARTE 4 — Email Transazionali (Stream Separato)

| Elemento | Stato | Note |
|---|---|---|
| `ticket-notify` usa `sendViaProvider()` | ✅ | |
| `reset-customer-password` usa `sendViaProvider()` | ✅ | |
| `create-customer` usa `sendViaProvider()` | ✅ | |
| `create-employee-user` usa `sendViaProvider()` | ✅ | |
| `create-salesperson-user` usa `sendViaProvider()` | ✅ | |
| `send-contact-message` usa `sendViaProvider()` | ✅ | |
| `check-due-dates` usa `sendViaProvider()` | ❌ | Usa ancora logica diretta senza shared lib |

---

### PARTE 5 — Automazioni: send_email

| Elemento | Stato | Note |
|---|---|---|
| `process-automation` case `send_email` | ✅ | Usa `sendViaProvider()` + `loadProviderSettings()` + personalizzazione + logging su `email_logs` |
| `AutomationNodeConfig.tsx`: toggle stream marketing/transazionale | ❌ | L'UI non permette di scegliere lo stream; il backend supporta `cfg.stream` ma il frontend non lo espone |

---

### PARTE 6 — RPC Statistiche

| Elemento | Stato | Note |
|---|---|---|
| `get_platform_email_stats` | ✅ | |
| `get_top_companies_by_email` | ✅ | |
| `get_email_stats_summary` | ✅ | |
| `get_email_stats_by_campaign` | ✅ | |
| `get_email_stats_by_date` | ✅ | |
| `deduct_email_credits_with_log` | ✅ | |
| `add_email_credits_with_log` | ✅ | |
| `init_company_email_credits` | ✅ | |

---

### PARTE 7 — Health Check e Banner

| Elemento | Stato | Note |
|---|---|---|
| `check-api-health`: verifica email | ⚠️ | Controlla solo `resend_api_key` — **non verifica** `email_marketing_api_key` ne `email_transactional_api_key` |
| `ApiHealthBanner` in EmailMarketing | ✅ | Ma usa il check sbagliato (vedi sopra) |
| Badge stato campagna (sending/sent/failed) in `EmailCampaignsTab` | ❌ | Non mostra badge stato dopo invio |

---

### PARTE 8 — Aggiornamenti UI mancanti

| Elemento | Stato | Note |
|---|---|---|
| `CampaignSendSettings.tsx`: sezione Destinatari/Segmentazione visuale | ❌ | Il backend supporta `segment_json` (tags, source, contact_type) ma non c'e UI per configurarla |
| `EmailCampaignsTab.tsx`: badge stato campagna | ❌ | |

---

## Riepilogo Finale

| Fase | Completamento |
|---|---|
| **Fase 1** — Shared Libs + DB | ✅ 95% |
| **Fase 2** — Super Admin Email Tab | ✅ 100% |
| **Fase 3** — Send Campaign + Tracking | ✅ 100% |
| **Fase 4** — Credits Page Azienda | ⚠️ 60% |
| **Fase 5** — Email Transazionali | ✅ 95% |
| **Fase 6** — Automazioni send_email | ⚠️ 80% |
| **Fase 7** — UI Updates | ⚠️ 50% |
| **Fase 8** — RPC + Health | ⚠️ 85% |

---

## Cosa manca — Lista completa

### Priorita Alta (funzionalita core)

1. **`check-api-health` aggiornamento**: verificare `email_marketing_api_key` e `email_transactional_api_key` invece di `resend_api_key`
2. **`check-due-dates`**: migrare a `sendViaProvider()` + `loadProviderSettings("transactional")`
3. **Badge stato campagna** in `EmailCampaignsTab.tsx`: mostrare sending/sent/failed/draft con colori
4. **Segmentazione UI** in `CampaignSendSettings.tsx`: filtri tag/source/contact_type per selezionare destinatari

### Priorita Media (completezza)

5. **Toggle stream nell'AutomationNodeConfig**: permettere scelta marketing/transazionale per azione send_email
6. **Dashboard periodo filtraggio effettivo**: il selettore periodo esiste ma la RPC `get_platform_email_stats` non accetta parametri data — i KPI non cambiano al variare del periodo

### Priorita Bassa (Stripe integration — futura)

7. **UI acquisto pacchetti crediti** con Stripe Checkout
8. **Auto Top-up UI** con Stripe SetupIntent (toggle + soglia + metodo pagamento)
9. **`auto-topup-check` edge function**
10. **`topup-credits` / `stripe-webhook`** per gestire email credits purchase

