

# Fix: "Cannot read properties of null (reading 'id')"

## Root Cause

The error occurs in `useCreateInternalFlow()` (line 107 of `useInternalAutomations.ts`):
```ts
company_id: effectiveCompany!.id,  // effectiveCompany is null → crash
```

The non-null assertion (`!`) crashes when `effectiveCompany` is still `null` (auth loading, or no company assigned to user). Same issue exists in `useSaveInternalNodes` (line 164).

## Fix

### 1. Guard mutations in `useInternalAutomations.ts`
- In `useCreateInternalFlow`: throw a clear error if `effectiveCompany` or `user` is null before attempting insert
- In `useSaveInternalNodes`: same guard for `effectiveCompany`
- This prevents the raw "Cannot read properties of null" error and shows a meaningful message instead

### 2. Guard UI in `FlowListView`
- Disable the "Crea Automazione" button when `effectiveCompany` is null (from `useAuth()`)
- This prevents the user from triggering the mutation before auth is ready

### Files Modified
| File | Change |
|------|--------|
| `src/hooks/useInternalAutomations.ts` | Add null guards in `useCreateInternalFlow` and `useSaveInternalNodes` |
| `src/pages/azienda/InternalAutomations.tsx` | Disable create button when company not loaded |

