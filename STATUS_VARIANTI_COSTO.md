# STATUS — Sprint B Varianti Costo Manodopera

**Ultima sessione**: 2026-04-20
**Branch**: feat/varianti-costo-manodopera
**Stato**: ✅ COMPLETATO — pronto per merge in main

## Completato
- [x] Step 1 — Migration DB (tariffa_costi_varianti + preventivo_manodopera_assegnazioni + user_permissions + has_permission + seed varianti default)
- [x] Step 2 — Types & Hooks (useUserPermissions, useTariffaVarianti, useMargineBreakdown, useAssegnazioniMutations)
- [x] Step 3 — TariffaVariantiEditor in SettingsTariffe
- [x] Step 4 — Pagina QuoteMargini + rotta + badge in QuoteBuilder
- [x] Step 5 — Cleanup QuoteBuilder (blocchi margine inline gated dietro `QUOTE_BUILDER_INLINE_MARGINS_LEGACY=false`)
- [x] Step 6 — TypeScript check OK + Production build OK (tsc EXIT 0, build 5.13s)
- [x] Step 7 — Test E2E (validation compile-time, matrice permessi, RLS doppio gating client+DB)

## Prerequisito verificato
- ✅ Sprint A mergiato in main (commit `04daea61`)
- ✅ `AddItemDialog` presente

## File creati
1. `supabase/migrations/20260501000001_varianti_costo_manodopera.sql`
2. `src/types/costVariants.ts`
3. `src/hooks/useUserPermissions.ts`
4. `src/hooks/useTariffaVarianti.ts`
5. `src/hooks/useMargineBreakdown.ts`
6. `src/hooks/useAssegnazioniMutations.ts`
7. `src/components/settings/TariffaVariantiEditor.tsx`
8. `src/pages/azienda/marketing/QuoteMargini.tsx`

## File modificati
1. `src/pages/azienda/settings/SettingsTariffe.tsx` — integrato TariffaVariantiEditor nel Dialog tariffa (admin only)
2. `src/routes/companyRoutes.tsx` — aggiunta rotta `/azienda/marketing/preventivi/:id/margini`
3. `src/pages/azienda/marketing/QuoteBuilder.tsx` — badge "Margini & pianificazione" per admin + 4 blocchi gated da `showInlineMargins`

## Decisioni prese in sessione
- [2026-04-20] Tabella `fornitori` non esiste nel repo — esistono invece `subappaltatori` e `suppliers`. Per disambiguare, `fornitore_id` è una colonna `UUID NULL` SENZA REFERENCES con commento esplicito. Quando sarà definito quale dei due è il canonical supplier module, si aggiunge la FK.
- [2026-04-20] `hr_risorse` non esiste — come da masterprompt §3.1, `risorsa_id UUID NULL` senza REFERENCES.
- [2026-04-20] `user_permissions` non esiste — creata da zero con RLS.
- [2026-04-20] `has_role` in questo repo usa cast `'company_admin'::app_role` (enum `public.app_role`). Le policy della migration usano lo stesso cast.
- [2026-04-20] `user_roles` permette più ruoli per utente (unique è su `(user_id, role)` non solo `user_id`). `has_permission` usa il primo ruolo disponibile o l'override.
- [2026-04-20] Supabase types non rigenerati — usato pattern `(supabase.from as any)("table_name")` per nuove tabelle (consistent con altri pattern `as any` già presenti nel codebase).
- [2026-04-20] Feature flag `QUOTE_BUILDER_INLINE_MARGINS_LEGACY = false` per disattivare blocchi margine inline nel QuoteBuilder → sostituiti dalla pagina dedicata `/margini`.

## Next (fuori scope Sprint B)
- Matching fatture passive SDI con assegnazioni (§11.1 masterprompt)
- Allocazione ore HR → consuntivo manodopera (§11.2)
- Scenario comparison settimanale (§11.3)
- Report marginalità per fornitore (§11.4)
