

# Billing Control Panel -- Analisi & Fix

Il documento descrive 7 fix da implementare per separare i ruoli super admin / azienda e aggiungere un sistema billing GHL-style. L'implementazione e' divisa in 4 fasi sequenziali.

---

## Fase 1 (P0 -- BUG SICUREZZA): Proteggere PlatformSettingsPage

**Problema**: La pagina PlatformSettingsPage (API Key ElevenLabs, markup, prezzi Telnyx) e' visibile alle aziende nel tab "Impostazioni" della sezione AI Agents.

**Interventi**:

1. **`src/modules/ai-agents/components/AgentSidebar.tsx`**: Importare `useAuth`, filtrare il link "Impostazioni" mostrando solo se `role === "super_admin"`

2. **`src/modules/ai-agents/index.tsx`**: Wrappare la route `/impostazioni` con un guard che verifica il ruolo e fa redirect se non super_admin

3. **Nuovo file `src/modules/ai-agents/components/MyPlanTab.tsx`**: Tab read-only per aziende che mostra:
   - Piano AI attivo (da `ai_subscriptions`)
   - Saldo crediti AI corrente (da `ai_credits`)
   - Costo per minuto addebitato (solo `cost_billed_per_min`, MAI il costo reale)
   - Pulsante "Ricarica crediti"

4. **AgentSidebar + routing**: Aggiungere link "Il mio piano" visibile solo alle aziende (non super_admin), con relativa route

---

## Fase 2 (P0 -- Database): Tabelle Billing Control

**Migration SQL** con 2 nuove tabelle + 1 RPC:

1. **`company_billing_overrides`**: Override prezzi/abilitazioni per azienda per servizio (email, ai_agents, whatsapp, sms, phone_numbers). Colonne: `is_enabled`, `is_free`, `price_per_unit_eur`, `markup_multiplier`, `monthly_fee_eur`, `custom_notes`. RLS: solo super_admin (usando `has_role` function esistente).

2. **`admin_credit_adjustments`**: Storico aggiustamenti manuali crediti. Colonne: `company_id`, `service`, `amount_eur`, `reason`, `created_by`. RLS: solo super_admin.

3. **`whatsapp_credits` + `whatsapp_credits_log`**: Tabelle per billing WhatsApp (struttura analoga a `ai_credits` e `email_credits_log`).

4. **RPC `adjust_email_credits`**: Funzione per aggiustamento crediti email (aggiunta/deduzione con log).

5. **Platform setting** `whatsapp_price_per_msg_eur` = '0.0006'.

---

## Fase 3 (P1 -- UI Admin): CompanyBillingTab

1. **Nuovo file `src/components/admin/company/CompanyBillingTab.tsx`** con 3 sezioni:
   - **Controllo Servizi**: Per ogni servizio (Email, AI, WhatsApp, SMS, Numeri Telefono) una card con switch Abilitato/Gratuito, input override prezzo, markup, fee mensile, note interne. Upsert in `company_billing_overrides`.
   - **Gestione Crediti**: Mostra saldi correnti di email/AI/WhatsApp con pulsanti Aggiungi/Deduci che aprono dialog con importo + motivazione obbligatoria.
   - **Storico Aggiustamenti**: Tabella ultime 50 operazioni da `admin_credit_adjustments`.

2. **`src/pages/admin/CompanyDetail.tsx`**: Aggiungere tab "Billing & Servizi" alla TabsList.

3. **Nuova edge function `admin-adjust-credits`**: Verifica ruolo super_admin, aggiusta saldo nel wallet corretto, logga in `admin_credit_adjustments`. Usa `_shared/auth.ts` e `_shared/headers.ts`.

---

## Fase 4 (P1-P2 -- Edge Functions): Override Pricing + WhatsApp Billing

1. **Nuovo file `supabase/functions/_shared/billingConfig.ts`**: Helper `getCompanyBillingConfig(client, companyId, service)` che carica override da `company_billing_overrides` e ritorna `{ isEnabled, isFree, pricePerUnitEur, markupMultiplier, monthlyFeeEur }`.

2. **`elevenlabs-webhook/index.ts`**: Nel calcolo costo, usare `getCompanyBillingConfig` per markup override AI.

3. **`create-checkout-session/index.ts`**: Nel case `ai_subscription`, verificare override fee mensile e gestire caso `isFree`.

4. **`send-whatsapp-reply/index.ts` + `whatsapp-broadcast/index.ts`**: Aggiungere deduction crediti WhatsApp prima dell'invio, controllando override e `is_enabled`.

5. **`SettingsCredits.tsx`**: Il tab WhatsApp deve mostrare saldo reale da `whatsapp_credits`, storico transazioni da `whatsapp_credits_log`, pulsante ricarica.

---

## Riepilogo file

| File | Azione |
|------|--------|
| `src/modules/ai-agents/components/AgentSidebar.tsx` | Filtro ruolo su link Impostazioni + aggiunta "Il mio piano" |
| `src/modules/ai-agents/index.tsx` | Guard route + nuova route "il-mio-piano" |
| `src/modules/ai-agents/components/MyPlanTab.tsx` | Nuovo -- tab read-only piano azienda |
| Migration SQL | 4 tabelle + 1 RPC + 1 platform_setting |
| `src/components/admin/company/CompanyBillingTab.tsx` | Nuovo -- pannello billing GHL-style |
| `src/pages/admin/CompanyDetail.tsx` | Aggiunta tab "Billing & Servizi" |
| `supabase/functions/admin-adjust-credits/index.ts` | Nuova edge function |
| `supabase/functions/_shared/billingConfig.ts` | Nuovo helper override pricing |
| `supabase/functions/elevenlabs-webhook/index.ts` | Override markup AI |
| `supabase/functions/create-checkout-session/index.ts` | Override fee mensile AI |
| `supabase/functions/send-whatsapp-reply/index.ts` | Deduction crediti WhatsApp |
| `supabase/functions/whatsapp-broadcast/index.ts` | Deduction crediti WhatsApp |
| `src/pages/azienda/settings/SettingsCredits.tsx` | WhatsApp saldo reale |

Data la complessita', implemento le 4 fasi in ordine: prima il fix critico di sicurezza (Fase 1), poi il database (Fase 2), poi UI admin (Fase 3), infine edge functions (Fase 4).

