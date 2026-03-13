

## Bug: Voci Fatturazione invisibili nella sidebar Finanza

### Causa
Il `permissionKey: "canViewBilling"` usato negli item di fatturazione non esiste nell'interfaccia `Permissions` né in `ALL_PERMISSIONS`. Risultato: `permissions["canViewBilling"]` è `undefined`, il filtro lo scarta, e le voci non appaiono — nemmeno per admin.

Stesso problema per `canViewScadenzario`, `canViewPrimaNota` e `canViewCosts` — tutti usati nella sidebar ma mai definiti nel sistema permessi.

### Fix

**File: `src/hooks/usePermissions.ts`**

1. Aggiungere all'interfaccia `Permissions`:
   - `canViewBilling: boolean`
   - `canViewScadenzario: boolean`
   - `canViewPrimaNota: boolean`
   - `canViewCosts: boolean`

2. Aggiungere gli stessi campi a `ALL_PERMISSIONS` (tutti `true`) e `NO_PERMISSIONS` (tutti `false`)

3. Nel blocco staff (linea 145-178), mappare ai valori DB se esistono colonne corrispondenti, altrimenti default a `true` per billing (dato che è controllato già da `featureKey`)

Questo renderà visibili tutte le voci della sezione Finanza per admin e staff con permessi appropriati.

