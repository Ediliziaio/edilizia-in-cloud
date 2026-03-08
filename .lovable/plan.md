

# Piano: Creare le tabelle mancanti per il Billing Control Panel

## Problema

L'implementazione precedente ha creato il codice frontend (`CompanyBillingTab.tsx`, `MyPlanTab.tsx`), le edge functions (`admin-adjust-credits`, `billingConfig.ts`), e la RPC `adjust_credits_atomic`, ma **3 tabelle critiche non sono mai state create nel database**:

| Tabella | Stato | Referenziata da |
|---------|-------|-----------------|
| `company_billing_overrides` | **MANCANTE** | `billingConfig.ts`, `CompanyBillingTab.tsx`, `elevenlabs-webhook`, `create-checkout-session`, `send-whatsapp-reply`, `whatsapp-broadcast` |
| `admin_credit_adjustments` | **MANCANTE** | `adjust_credits_atomic` RPC, `CompanyBillingTab.tsx`, `admin-adjust-credits` edge function |
| `whatsapp_credits` | **MANCANTE** | `adjust_credits_atomic` RPC, `CompanyBillingTab.tsx`, `send-whatsapp-reply`, `whatsapp-broadcast` |

Questo significa che tutte le funzionalita' billing sono attualmente non funzionanti.

## Intervento

Una singola migration SQL che crea le 3 tabelle mancanti con RLS:

### 1. `company_billing_overrides`
- `company_id`, `service` (enum check), `is_enabled`, `is_free`, `price_per_unit_eur`, `markup_multiplier`, `monthly_fee_eur`, `custom_notes`, `updated_by`
- UNIQUE su `(company_id, service)`
- RLS: solo super_admin tramite `has_role()`

### 2. `admin_credit_adjustments`
- `company_id`, `service`, `amount_eur`, `reason`, `created_by`, `created_at`
- RLS: solo super_admin tramite `has_role()`

### 3. `whatsapp_credits`
- Struttura analoga ad `ai_credits`: `company_id` (UNIQUE), `balance_eur`, `sends_blocked`, `auto_recharge_enabled/threshold/amount`, `updated_at`
- RLS: company members read + super_admin full access

Nessuna modifica al codice frontend o edge functions necessaria -- il codice gia' esistente referenzia correttamente queste tabelle.

