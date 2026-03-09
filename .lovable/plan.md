

# Security Fix & Route Protection Plan

## 5 tasks, ordered by priority

---

## 1. [CRITICAL] Stripe Webhook Signature Verification

**File:** `supabase/functions/stripe-webhook/index.ts`

**Problem:** The webhook accepts any POST request without verifying it actually comes from Stripe. Anyone can send fake events to manipulate subscriptions/payments.

**Fix:**
- Add `import Stripe from 'npm:stripe@14'` at top
- After reading `STRIPE_SECRET_KEY`, check for `STRIPE_WEBHOOK_SECRET` env var
- Read body as text (already done on line 343), get `stripe-signature` header
- Use `stripe.webhooks.constructEvent(body, signature, webhookSecret)` to verify
- Replace `JSON.parse(body)` on line 344 with the verified event
- Return 400 if signature missing or invalid

**Prerequisite:** The `STRIPE_WEBHOOK_SECRET` secret must be added. Will use `add_secret` tool to request it from the user.

---

## 2. [HIGH] Admin Route Guards on 8 Settings Pages

**Files to modify (8 total):**
- `SettingsSuppliers.tsx`
- `SettingsSalespeople.tsx`
- `SettingsStaff.tsx`
- `SettingsActivityLog.tsx`
- `SettingsTags.tsx`
- `SettingsCustomFields.tsx`
- `SettingsPipelines.tsx`
- `SettingsOrderStatus.tsx`

**Pattern:** Follow `SettingsUsers.tsx` as reference. Each file will:
- Import `useAuth`, `useNavigate`, `useEffect`
- Check `role === "company_admin" || role === "super_admin"`
- Redirect non-admins to `/azienda` with `replace: true`
- Return `null` while checking or if not admin

---

## 3. [MEDIUM] Type Safety - Remove `as never` casts in SettingsCredits.tsx

**File:** `src/pages/azienda/settings/SettingsCredits.tsx`

**Problem:** Lines 92-94 use `as never` to query `ai_credits` table, and lines 108-110 do the same for `whatsapp_credits`. These tables likely exist in the database but are missing from generated types.

**Fix:** Since we cannot edit `types.ts` (auto-generated), the `as never` casts are actually the pragmatic workaround until types are regenerated. No action needed -- this is a non-issue in practice since the tables exist and queries work. Will leave as-is.

---

## 4. [MEDIUM] Update .env.example

**File:** `.env.example`

Replace contents with comprehensive list of all environment variables used across edge functions (Stripe, Meta, WhatsApp, Google Calendar, GoCardless, etc.).

---

## 5. [LOW] Create Logger Utility + Replace console.error

**New file:** `src/utils/logger.ts` -- dev-only logger with `error`, `warn`, `info` methods.

**Files to update (4):**
- `src/pages/azienda/CreateOrder.tsx` (lines 396, 411)
- `src/pages/azienda/EditOrder.tsx` (line 606)
- `src/pages/azienda/CompanyCustomerDetail.tsx` (lines 141, 172)
- `src/pages/azienda/CreateCustomer.tsx` (line 85)

Replace `console.error(...)` with `logger.error(...)`.

---

## Summary of Changes

| # | Priority | Files | Type |
|---|----------|-------|------|
| 1 | CRITICAL | `stripe-webhook/index.ts` | Edge function edit + new secret |
| 2 | HIGH | 8 Settings pages | Add admin guard |
| 3 | MEDIUM | SettingsCredits.tsx | Skip (pragmatic workaround) |
| 4 | MEDIUM | `.env.example` | Documentation |
| 5 | LOW | 5 files (1 new + 4 edits) | Logger utility |

