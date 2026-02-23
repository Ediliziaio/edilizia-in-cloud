

# Fix: "Vuoto" non apre la pagina editor

## Problema

Quando clicchi "Vuoto", la mutation per creare la bozza fallisce silenziosamente perche il componente `CampaignCreateDropdown` usa `company` e `user` da `useAuth()`. Quando sei in modalita impersonazione (super admin che visualizza come un'azienda), `company` e `null` - il valore corretto e `effectiveCompany`. L'espressione `company!.id` causa un errore runtime che viene catturato dall'`onError` e mostrato come toast, ma potrebbe non essere visibile.

## Soluzione

Modificare `CampaignCreateDropdown.tsx` per usare `effectiveCompany` al posto di `company`:

```
const { effectiveCompany, user } = useAuth();
```

E nella mutation:

```
company_id: effectiveCompany!.id,
```

Aggiungere anche una guardia per disabilitare il pulsante se `effectiveCompany` e `null`.

Lo stesso problema potrebbe esistere in `CampaignEditor.tsx` e `CampaignSendSettings.tsx` - vanno controllati e corretti allo stesso modo.

## File da modificare

| File | Modifica |
|------|----------|
| `CampaignCreateDropdown.tsx` | Usare `effectiveCompany` invece di `company` |
| `CampaignEditor.tsx` | Verificare e correggere uso di `company` vs `effectiveCompany` |
| `CampaignSendSettings.tsx` | Verificare e correggere uso di `company` vs `effectiveCompany` |

