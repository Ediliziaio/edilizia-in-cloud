

# Audit — Dashboard Marketing/Vendite, Contatti, Opportunità

## Bug trovati

### Bug 1 (P0): Create/Delete opportunità non invalidano la dashboard marketing
**File:** `src/hooks/useOpportunitiesData.ts`
- `useCreateOpportunity` (riga 158-161): invalida solo `queryKeys.opportunities.all`. La dashboard marketing (`queryKeys.marketing.all`) NON viene invalidata. Creare un'opportunità non aggiorna i KPI.
- `useDeleteOpportunity` (riga 243-245): invalida solo `queryKeys.opportunities.all`, non `marketingContacts` né `marketing`. Dashboard e contatti restano stale.
- `useBulkDeleteOpportunities` (riga 435-438): stessa mancanza.
- `useBulkUpdateOpportunities` (riga 415-418): stessa mancanza.
- `useAddOpportunityNote` (riga 395-396): invalida solo `marketingContacts.all`, non `opportunities.all`. Il conteggio note nella card opportunità resta stale.

**Fix:** Aggiungere le invalidazioni mancanti:
- `useCreateOpportunity.onSuccess`: + `queryKeys.marketingContacts.all` + `queryKeys.marketing.all`
- `useDeleteOpportunity.onSuccess`: + `queryKeys.marketingContacts.all` + `queryKeys.marketing.all`
- `useBulkDeleteOpportunities.onSuccess`: + `queryKeys.marketingContacts.all` + `queryKeys.marketing.all`
- `useBulkUpdateOpportunities.onSuccess`: + `queryKeys.marketingContacts.all` + `queryKeys.marketing.all`
- `useUpdateOpportunity.onSuccess`: + `queryKeys.marketing.all`
- `useUpdateOpportunityStage.onSettled`: + `queryKeys.marketing.all`
- `useAddOpportunityNote.onSuccess`: + `queryKeys.opportunities.all`

### Bug 2 (P1): Filtro "Fonte" costruito su dataset troncato a 500 righe
**File:** `src/components/marketing/dashboard/DashboardFilters.tsx`, riga 60
La query per le fonti disponibili fa `.limit(500)` sulla tabella `marketing_contacts` e poi estrae le `source` distinte. Con >500 contatti, molte fonti sono invisibili nel filtro. Il filtro diventa incompleto e la dashboard non mostra segmenti reali.

**Fix:** Usare una query `SELECT DISTINCT source FROM marketing_contacts WHERE company_id = ? AND source IS NOT NULL` — implementabile con `.select("source")` senza limit ma con una RPC o almeno un limit molto più alto (10000), dato che stiamo estraendo solo una colonna leggera. Soluzione pragmatica: rimuovere il `.limit(500)` e aggiungere `.limit(10000)` per sicurezza, dato che la colonna `source` è piccola.

### Bug 3 (P1): Preferenze colonne non isolate per tenant/utente
**File:** `src/components/marketing/ContactsTable.tsx`, riga 84
`STORAGE_KEY = "contacts-visible-columns"` è una chiave globale. In ambiente multi-tenant (es. super admin che accede a più aziende, o utenti diversi sullo stesso browser), le preferenze si contaminano.

**Fix:** Rendere la chiave scoped per userId + companyId. Modificare `loadVisibleColumns` e `saveVisibleColumns` per accettare una chiave contestuale. Nel componente padre (`MarketingContacts.tsx`), passare `userId-companyId` come parte della chiave.

### Bug 4 (P1): Import contatti non normalizza il telefono
**File:** `src/pages/azienda/marketing/MarketingContacts.tsx`, riga 644-659
Durante l'import, il telefono viene salvato con `r.phone?.trim()` senza nessuna normalizzazione. Il `ContactDialog` usa `cleanPhone()` che rimuove spazi, trattini e punti. Import e creazione manuale scrivono formati diversi, rompendo la deduplica (riga 749-757 confronta phone raw).

**Fix:** Applicare `cleanPhone()` al telefono durante l'import, nella stessa posizione (riga 659). Estrarre `cleanPhone` in un modulo condiviso (`src/lib/contactUtils.ts`) e importarlo sia in `ContactDialog.tsx` che in `MarketingContacts.tsx`.

### Bug 5 (P1): `useOpportunityDetailData` usa query key inline, non la factory
**File:** `src/hooks/useOpportunityDetailData.ts`
Tutti gli hook usano chiavi inline (`["marketing_contacts"]`, `["marketing_custom_fields"]`, ecc.) che non matchano la factory `queryKeys`. Le invalidazioni da `useOpportunitiesData.ts` (che usano `queryKeys.marketingContacts.all` = `["marketing-contacts"]`) non raggiungono `["marketing_contacts"]` (underscore vs dash). Questo causa mismatch: l'invalidazione dei contatti post-update opportunità non aggiorna il dettaglio contatto.

**Fix:** Aggiornare le query key in `useOpportunityDetailData.ts` per usare la factory `queryKeys` dove possibile, e aggiungere le chiavi mancanti alla factory.

### Bug 6 (P2): Enrichment opportunità usa `.limit(5000)` per note/docs
**File:** `src/hooks/useOpportunitiesData.ts`, righe 74, 79, 92
Le query di enrichment usano `.limit(5000)`. Superato il limite, i conteggi sono troncati silenziosamente. Dato che servono solo conteggi, non dati, questo è inefficiente. Non è un bug critico ora ma è una fragilità.

**Fix:** Accettabile per ora, ma aggiungere un commento sul limite. Il fix ideale sarebbe una RPC con `COUNT(*)`, ma il vincolo di non over-engineering lo esclude.

---

## Piano correzioni

| File | Fix | Tipo |
|------|-----|------|
| `src/hooks/useOpportunitiesData.ts` | Invalidazioni mancanti su 6 mutation | Cache |
| `src/components/marketing/dashboard/DashboardFilters.tsx` | Rimuovere `.limit(500)`, usare `.limit(10000)` | Filtri |
| `src/components/marketing/ContactsTable.tsx` | Scoping chiave localStorage per tenant/utente | Isolamento |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Normalizzare telefono in import | Deduplica |
| `src/lib/contactUtils.ts` | Centralizzare `cleanPhone` | Standard |
| `src/components/marketing/ContactDialog.tsx` | Importare `cleanPhone` da contactUtils | Standard |
| `src/hooks/useOpportunityDetailData.ts` | Allineare query key inline a factory (dove mismatch) | Cache |

7 file, 6 bug. Nessun rischio di regressione. Nessun cambio UX.

