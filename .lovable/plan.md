

# Rimozione completa Onboarding Checklist

## File da eliminare
1. **`src/components/company/OnboardingChecklist.tsx`** — il componente widget
2. **`src/hooks/useOnboardingProgress.ts`** — il hook dedicato (usato solo dal widget)

## File da modificare
**`src/components/layouts/CompanyLayout.tsx`**:
- Rimuovere import di `OnboardingChecklist`
- Rimuovere `<OnboardingChecklist />` dal JSX (riga 481)

## Cosa resta invariato
- `getOnboardingPct` in `companyUtils.ts` — usato dal pannello admin (`CompanyExpandedRow`), non viene toccato
- Nessuna migrazione DB
- Nessun cambio funzionale al resto dell'app

## Pulizia aggiuntiva
- Il `localStorage` key `onboarding-dismissed-{companyId}` diventa inerte (nessun codice lo legge più). Non serve cleanup esplicito.

