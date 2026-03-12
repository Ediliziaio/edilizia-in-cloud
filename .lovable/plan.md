

# Piano: Fix pattern auth in SettingsPhoneNumbers

## Problema
`SettingsPhoneNumbers.tsx` riga 58 usa `profile?.company_id` invece di `effectiveCompany?.id`, impedendo l'impersonificazione super admin.

## Fix
Cambiare:
```typescript
// DA
const { profile } = useAuth();
const companyId = profile?.company_id || null;

// A
const { effectiveCompany } = useAuth();
const companyId = effectiveCompany?.id || null;
```

Un singolo file impattato: `src/pages/azienda/settings/SettingsPhoneNumbers.tsx`

