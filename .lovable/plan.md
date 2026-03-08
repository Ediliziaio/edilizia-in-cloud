

# Billing Control v4 -- Remaining Gaps

After auditing all files against the document, the implementation is **95% complete**. Two gaps remain:

---

## GAP 1: `MarketingAiAgent.tsx` still links to "Impostazioni piattaforma" for all users

**File**: `src/pages/azienda/marketing/MarketingAiAgent.tsx` (line 239)

The "Azioni rapide" section has a button "Impostazioni piattaforma" that navigates to `/azienda/marketing/agente-ai/impostazioni`. While the route is guarded by `SuperAdminGuard`, the button is still visible to company users -- clicking it causes a redirect. This exposes the existence of the settings page and creates a confusing UX.

**Fix**: Import `useAuth`, check `role === "super_admin"`, and conditionally render this button. For non-super-admin users, replace it with a link to "Il mio piano" (`/azienda/marketing/agente-ai/il-mio-piano`).

---

## GAP 2: `create-checkout-session` missing `whatsapp_credits` case

**File**: `supabase/functions/create-checkout-session/index.ts`

The document (FIX 7, step 5) specifies adding a `whatsapp_credits` checkout case analogous to `email_credits`. Currently the function only handles `ai_subscription`, `email_credits`, and `subscription` types. The `SettingsCredits.tsx` UI only has "Ricarica Email" and "Ricarica AI" tabs but no "Ricarica WhatsApp" tab.

**Fix**:
1. Add `type === "whatsapp_credits"` case in `create-checkout-session/index.ts` -- same pattern as `email_credits` but with product name "Crediti WhatsApp" and metadata type `whatsapp_credits`
2. Add a "Ricarica WhatsApp" tab in `SettingsCredits.tsx` with the same package cards (€10, €25, €50, €100) calling `create-checkout-session` with `type: "whatsapp_credits"`
3. Add WhatsApp credits log tab ("Storico WhatsApp") showing `whatsapp_credits_log` entries

---

## Files to modify

| File | Change |
|------|--------|
| `src/pages/azienda/marketing/MarketingAiAgent.tsx` | Hide "Impostazioni piattaforma" button for non-super-admin, show "Il mio piano" instead |
| `supabase/functions/create-checkout-session/index.ts` | Add `whatsapp_credits` checkout case |
| `src/pages/azienda/settings/SettingsCredits.tsx` | Add "Ricarica WhatsApp" tab + "Storico WhatsApp" tab |

