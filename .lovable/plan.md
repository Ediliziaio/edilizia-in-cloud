

# Batch C (Continuazione) + Batch D — Logger Migration e Currency Refactor

## Situazione Attuale

Dopo Batch A, B e C parziale, rimangono:
- **~240 `console.error`** in **29 file** non ancora migrati al logger
- **~212 `€${...}`** inline in **~32 file** (escluso `formatters.ts` e `creditCalculator.ts` che sono utility legittime)
- **~73 `.toFixed(2)`** per valori monetari in **9 file**

Troppi per un singolo messaggio. Propongo di procedere in 2 sotto-batch, partendo dai file con più occorrenze e maggiore impatto.

---

## Sotto-Batch C2: Logger Migration (Top 15 file)

Sostituire `console.error(...)` con `logger.error(...)` nei file più critici:

1. `src/components/messaging/MessagingSettingsTab.tsx`
2. `src/components/employees/EmployeeAttachments.tsx`
3. `src/components/admin/QuickLoginReturnBanner.tsx`
4. `src/modules/ai-agents/pages/AgentCreditsPage.tsx`
5. `src/pages/auth/ChangePassword.tsx`
6. `src/components/auth/RoleBasedRedirect.tsx`
7. `src/components/calendar/CalendarGanttView.tsx`
8. `src/components/admin/QuickLoginPopover.tsx`
9. `src/components/landing/AIImage.tsx`
10. `src/components/settings/UsersConfig.tsx`
11. `src/components/orders/InlineEditableDatesCard.tsx`
12. `src/components/layouts/SupportChatSheet.tsx`
13. `src/components/orders/OrderItemAttachments.tsx`
14. `src/components/integrations/steps/FormListStep.tsx`
15. `src/pages/partner/PartnerPayout.tsx`

Pattern: `console.error("msg", err)` → `logger.error("msg", err)`

## Sotto-Batch C3: Currency Formatting (Top 10 file)

Sostituire `€${...}` e `.toFixed(2)` per valori monetari con `formatCurrency()` o `formatCurrencyCompact()`:

1. `src/components/admin/dashboard/AdminMrrMovements.tsx` — chart axis
2. `src/pages/venditore/MyEarnings.tsx` — chart axis + badge
3. `src/pages/azienda/marketing/SalesOSDashboard.tsx` — 2 chart axes
4. `src/components/cruscotto/CruscottoAlerts.tsx` — alert messages
5. `src/pages/azienda/billing/BillingReports.tsx` — chart axis + local `fmtEur`
6. `src/components/forecast/CostsStatsCards.tsx` — chart axis
7. `src/components/forecast/CostBudgetManager.tsx` — chart axis
8. `src/components/warehouse/WarehouseItemDetailDialog.tsx` — `€ ${price.toFixed(2)}`
9. `src/modules/ai-agents/components/CreditUsageBar.tsx` — `€${x.toFixed(2)}`
10. `src/modules/ai-agents/components/PhoneNumberManager.tsx` — `€${x.toFixed(2)}`

Chart axes: `tickFormatter={(v) => \`€${v}\`}` → `tickFormatter={formatCurrencyCompact}`
Display values: `€${x.toFixed(2)}` → `formatCurrency(x)`
Local `fmtEur` helpers: eliminate, use centralized `formatCurrency`

## Sotto-Batch D: Checklist Finale

After C2+C3, verify:
- All mutations have `onError` with toast (spot check top 5 mutation files)
- All delete actions have AlertDialog confirmation
- Submit buttons disabled during `isPending`

---

## Implementazione

Procederò con **C2 (logger, 15 file) + C3 (currency, 10 file)** in questo messaggio — 25 file totali con fix chirurgici.

