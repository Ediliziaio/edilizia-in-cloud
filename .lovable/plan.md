

# Billing Control Panel v3 -- Gap Analysis & Remaining Work

## Already Implemented (No Changes Needed)

All 7 fixes from the document are substantially complete:

| Fix | Status |
|-----|--------|
| FIX 1: PlatformSettingsPage protected + MyPlanTab | DONE -- `SuperAdminGuard` in `index.tsx`, role filter in `AgentSidebar.tsx`, `MyPlanTab.tsx` created |
| FIX 2: Database tables | DONE -- `company_billing_overrides`, `admin_credit_adjustments`, `whatsapp_credits`, `whatsapp_credits_log` all exist with RLS |
| FIX 3: CompanyBillingTab UI | DONE -- Tab "Billing & Servizi" in `CompanyDetail.tsx`, `CompanyBillingTab.tsx` with service controls, credit management, adjustment history |
| FIX 4: billingConfig.ts helper | DONE -- `_shared/billingConfig.ts` with `getCompanyBillingConfig()` |
| FIX 5: Override in elevenlabs-webhook | DONE -- Reads `billingConfig` for markup override |
| FIX 5: Override in create-checkout-session | DONE -- Handles `isFree` and custom monthly fee |
| FIX 6: admin-adjust-credits edge function | DONE -- Uses `requireAuth` + `requireRole("super_admin")` + `adjust_credits_atomic` RPC |
| FIX 7: WhatsApp billing in send-whatsapp-reply + whatsapp-broadcast | DONE -- Both check `getCompanyBillingConfig` |

## Remaining Gaps (from document section 2.5)

The document explicitly lists these edge functions as needing billing override checks, but they are **not yet integrated**:

### 1. `send-email-campaign/index.ts` -- No billing override check
Currently uses `deductEmailCredits` directly without checking `company_billing_overrides`. Should:
- Check `getCompanyBillingConfig(client, companyId, "email")`
- If `isEnabled === false` --> reject with error
- If `isFree === true` --> skip credit deduction
- If `pricePerUnitEur` is set --> use custom price instead of global

### 2. `send-contact-message/index.ts` -- No billing override check
This function sends both email and WhatsApp messages. Currently has no billing override integration for the email path. Should apply the same logic as above for the email channel.

### 3. `telnyx-proxy/index.ts` -- No billing override check (lower priority)
Document mentions SMS/phone_numbers pricing override should be checked here. This is P2 since the document notes it's "when implemented."

## Implementation

### For `send-email-campaign/index.ts`:
- Import `getCompanyBillingConfig` from `_shared/billingConfig.ts`
- Before the send loop, fetch billing config for `"email"` service
- Gate on `isEnabled` and `isFree`
- Pass custom `pricePerUnitEur` to `deductEmailCredits` if set (or skip deduction if free)

### For `send-contact-message/index.ts`:
- Import `getCompanyBillingConfig`
- Before sending email, check billing config for `"email"`
- Before sending WhatsApp, check billing config for `"whatsapp"`
- Apply same enabled/free/custom-price logic

### For `telnyx-proxy/index.ts` (P2):
- Import `getCompanyBillingConfig`
- Check `"sms"` or `"phone_numbers"` service config before proxying

## Files to modify

| File | Change |
|------|--------|
| `supabase/functions/send-email-campaign/index.ts` | Add billing override check before email deduction |
| `supabase/functions/send-contact-message/index.ts` | Add billing override check for email and WhatsApp paths |
| `supabase/functions/telnyx-proxy/index.ts` | Add billing override check for SMS (P2) |

