

# Fix: Error handling in PlatformTeamTab.tsx

## Problema
Un solo punto rimane con il pattern errato: la `resetMutation` in `PlatformTeamTab.tsx` (riga 103) usa ancora `throw new Error(res.error.message)` senza estrarre il messaggio specifico dal body JSON.

Tutti gli altri file (`PlatformPermissionsDialog`, `CreatePlatformUserDialog`, `MultiCompanyUsersTab`) sono già stati corretti.

## Modifica

**File**: `src/components/admin/settings/PlatformTeamTab.tsx`, riga 103

Sostituire:
```typescript
if (res.error) throw new Error(res.error.message);
```

Con:
```typescript
if (res.error) {
  const body = await res.error.context?.json?.();
  throw new Error(body?.error || res.error.message);
}
```

Una sola riga da correggere.

