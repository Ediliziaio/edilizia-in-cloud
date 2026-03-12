

# F1: Native Billing Schema, Types & Hook

## Overview
Create the complete database schema for native billing (6 tables), TypeScript types, a CRUD hook, and stub routes. This is entirely new code — no existing files are modified except `companyRoutes.tsx` (add routes) and `src/lib/queryKeys.ts` (add keys).

## 1. Database Migration

Create all 6 tables: `anagrafica_azienda`, `anagrafiche_native`, `articoli_native`, `documenti_fiscali`, `movimenti_cassa_native`, `sdi_log`.

**Critical fix from the prompt**: The RLS policies reference a `company_users` table that doesn't exist. The project uses `public.get_my_company_id()` security definer function. All RLS policies will use:
```sql
USING (company_id = public.get_my_company_id())
```

**Another fix**: Replace `CHECK` constraints with validation triggers per project guidelines (e.g. `billing_mode`, `partita_iva` length, `tipo` enums). Actually, the CHECK constraints on enums/lengths are immutable and safe — only time-based checks need triggers. So CHECK constraints for enum values and string lengths are fine.

Also includes:
- Performance indexes (8 indexes)
- `aggiorna_stats_anagrafica_native` trigger
- `genera_numero_documento_native` atomic function with `FOR UPDATE` locking
- RLS policies on all 6 tables using `get_my_company_id()`
- Missing RLS for `movimenti_cassa_native` and `sdi_log` (prompt omitted these)

## 2. TypeScript Types: `src/types/fatturazione.ts`

Complete file with all Italian fiscal enums:
- `REGIMI_FISCALI`, `METODI_PAGAMENTO_SDI`, `NATURE_IVA`, `TIPI_DOCUMENTO_FATTURAPA`, `CAUSALI_RITENUTA`, `TIPI_CASSA_PREVIDENZIALE`
- Interfaces: `RigaDocumento`, `RiepilogoIVA`, `ScadenzaPagamento`, `ClienteSnapshot`, `DocumentoFiscale`
- Types: `StatoDocumento`, `TipoDocumento`

## 3. CRUD Hook: `src/hooks/useDocumentiFiscali.ts`

React Query hook with:
- `useDocumentiFiscali(filters)` — paginated list (50/page), server-side filters by tipo/stato/anagrafica_id/date range
- `useDocumentoFiscale(id)` — single document
- `useCreateDocumento()` — calls `genera_numero_documento_native` RPC then inserts
- `useUpdateDocumento()` — mutation (only bozza/emessa)
- `useDeleteDocumento()` — only for `bozza` stato
- `useEmittiDocumento(id)` — validates required fields, changes stato to `emessa`

Query keys added to `src/lib/queryKeys.ts` under `documentiFiscali` namespace.

## 4. Routes in `companyRoutes.tsx`

Add native billing routes wrapped with `BillingModeGuard requiredMode="native"`:
- `/azienda/documenti` — DocumentiFiscaliList (stub placeholder page)
- `/azienda/documenti/nuovo` — stub
- `/azienda/documenti/:id` — stub

Create a minimal placeholder page `src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx` so routes don't 404.

## Files to create/modify

| File | Action |
|------|--------|
| `supabase/migrations/[new].sql` | 6 tables, indexes, RLS, triggers, function |
| `src/types/fatturazione.ts` | All TS types and fiscal enums |
| `src/hooks/useDocumentiFiscali.ts` | CRUD hook with React Query |
| `src/lib/queryKeys.ts` | Add `documentiFiscali` keys |
| `src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx` | Stub placeholder page |
| `src/routes/companyRoutes.tsx` | Add 3 native billing routes |

