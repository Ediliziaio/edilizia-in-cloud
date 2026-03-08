

## Analisi Step-by-Step e Piano di Pulizia

Ho analizzato in profondita tutto il flusso email: shared libraries, edge functions, componenti frontend, hook, banner, dashboard e automazioni. Ecco lo stato reale e le azioni necessarie.

---

### Stato Attuale — Tutto Funzionante

Tutte le 8 aree core sono implementate e coerenti:

- **Shared libs** (`emailProvider.ts`, `emailCredits.ts`): pulite, nessun codice morto
- **Admin Email Tab** (Provider, Pricing, Dashboard): completo e funzionale
- **Campaign send + tracking**: `segment_json` salvato, `recipientCount` dinamico, badge stato
- **Email transazionali**: tutti migrati a `sendViaProvider()`
- **Automazioni send_email**: stream toggle presente in UI e backend
- **Health check**: granulare marketing/transactional
- **`check-due-dates`**: delega correttamente a `execute_automation` RPC (non deve usare sendViaProvider)

---

### Problemi Trovati — Da Risolvere

#### 1. `check-api-health` usa `serve()` deprecato + CORS incompleto

Usa `import { serve }` da `deno.land/std` e CORS headers ridotti. Dovrebbe usare `Deno.serve()` (pattern moderno) e CORS completi come le altre funzioni email.

#### 2. `process-automation` ha CORS incompleto

Solo `"authorization, x-client-info, apikey, content-type"` — mancano gli header Supabase client platform. Non critico perche invocata da cron, ma inconsistente.

#### 3. `check-due-dates` ha CORS incompleto

Stesso problema. Headers minimi.

#### 4. `send-email-campaign` — invio sequenziale lento

Il loop `for (const contact of recipients)` e sequenziale. Per campagne >50 destinatari rischia timeout. Va aggiunto parallelismo con batch di 5-10 invii concorrenti via `Promise.all`.

#### 5. `CampaignSendSettings.tsx` — segmentSource `value=""` non funziona con Radix Select

`<SelectItem value="">Qualsiasi</SelectItem>` — Radix Select non accetta stringhe vuote come value. Il reset della sorgente non funziona. Stesso problema per `segmentContactType`. Va usato `value="all"` e mappato a stringa vuota internamente.

#### 6. Inconsistenza naming campo crediti

Il DB usa `balance_eur` (float in EUR) ma la logica applica 1 credito = 1 email. Non e un bug funzionale ma crea confusione. Solo commento da aggiungere, non modifica strutturale.

---

### Azioni di Pulizia

| # | File | Azione | Tipo |
|---|------|--------|------|
| 1 | `check-api-health/index.ts` | Migrare da `serve()` a `Deno.serve()`, CORS completi | Cleanup |
| 2 | `process-automation/index.ts` | Aggiornare CORS headers (consistenza) | Cleanup |
| 3 | `check-due-dates/index.ts` | Aggiornare CORS headers (consistenza) | Cleanup |
| 4 | `send-email-campaign/index.ts` | Aggiungere invio parallelo in batch di 5 con `Promise.all` | Performance |
| 5 | `CampaignSendSettings.tsx` | Fix Select value vuoto: usare `"all"` e mappare a `""` | Bug fix |

Nessun codice morto residuo. `EmailProviderSettings.tsx` gia rimosso. `resend_api_key` gia eliminato ovunque. La vecchia RPC `deduct_email_credits` esiste nel DB ma non viene piu chiamata da nessun edge function (solo presente in `types.ts` autogenerato).

