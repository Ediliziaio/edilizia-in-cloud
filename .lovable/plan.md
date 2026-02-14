
# Analisi e Miglioramenti Sezione Super Admin

## 1. Dashboard (`AdminDashboard.tsx` - 443 righe)

**Problemi trovati:**
- **Link morto**: Riga 422, il bottone "Vedi Ordini Globali" punta a `/admin/ordini` che non esiste piu (la pagina GlobalOrders e stata eliminata). Va rimosso.
- **File monolitico**: 443 righe con query, logica di calcolo e UI tutto insieme. Andrebbe scomposto in componenti e un hook dedicato.
- **`sectorLabels` duplicato**: Definito localmente (righe 42-51) ma esiste gia in `src/lib/companyUtils.ts`. Va usato quello centralizzato.

**Intervento proposto:**
- Rimuovere il bottone "Vedi Ordini Globali" dalla sezione Azioni Rapide
- Sostituire `sectorLabels` locale con l'import da `companyUtils`
- Estrarre la query in un hook `useAdminDashboardData`
- Scomporre la UI in componenti: `AdminStatCards`, `AdminMrrStats`, `AdminRecentCompanies`, `AdminRecentActivity`, `AdminQuickActions`

---

## 2. Dettaglio Azienda (`CompanyDetail.tsx` - 707 righe)

**Problemi trovati:**
- **Ancora troppo grande** (707 righe): nonostante la UI sia stata scomposta in tab, tutta la logica (7 query, 3 mutation, 8+ handler, 15+ variabili di stato) rimane nel file orchestratore.
- **Fetch iniziale con `useEffect`/`useState`** (righe 103-142): la query principale dell'azienda usa ancora il pattern manuale con `useEffect` invece di `useQuery`, rompendo la coerenza con il resto del codice.
- **Nessun caching** sulla query principale dell'azienda.

**Intervento proposto:**
- Estrarre tutta la logica in un hook `useCompanyDetail(id)` che restituisce dati, mutations e handler
- Migrare il fetch iniziale dell'azienda (righe 103-142) a `useQuery` con `staleTime`
- Ridurre CompanyDetail.tsx a circa 150-200 righe (solo composizione UI e dialoghi)

---

## 3. Lista Aziende (`CompaniesList.tsx` - 217 righe)

**Stato: Buono.** Gia migrato a `useQuery`, dimensione gestibile. Nessun intervento necessario.

---

## 4. Ticket Globali (`GlobalTickets.tsx` - 275 righe)

**Stato: Buono.** Gia migrato a `useQuery` con `useMemo` per i filtri. Nessun intervento necessario.

---

## 5. Creazione Azienda (`CreateCompany.tsx` - 441 righe)

**Stato: Accettabile.** E un form lungo ma lineare. La struttura e chiara. Nessun intervento critico.

---

## 6. Piani Tariffari (`SubscriptionPlans.tsx` - 406 righe)

**Problemi trovati:**
- **`ALL_MODULES` duplicato**: Definito localmente (righe 16-24) ma esiste gia in `src/lib/adminConstants.ts`. Va usato quello centralizzato.

**Intervento proposto:**
- Sostituire la definizione locale con l'import da `adminConstants`

---

## 7. Impostazioni (`AdminSettings.tsx` - 226 righe)

**Stato: Buono.** File compatto e ben strutturato. Nessun intervento necessario.

---

## 8. Layout Admin (`AdminLayout.tsx` - 127 righe)

**Stato: Buono.** Compatto e pulito. Nessun intervento necessario.

---

## Riepilogo Interventi per Priorita

| Priorita | File | Intervento | Impatto |
|----------|------|------------|---------|
| Critico | `AdminDashboard.tsx` | Rimuovere link morto `/admin/ordini` | Bug fix |
| Alto | `AdminDashboard.tsx` | Rimuovere `sectorLabels` duplicato, usare import | Consistenza |
| Alto | `SubscriptionPlans.tsx` | Rimuovere `ALL_MODULES` duplicato, usare import | Consistenza |
| Alto | `CompanyDetail.tsx` | Migrare fetch iniziale a `useQuery` | Coerenza architetturale |
| Medio | `AdminDashboard.tsx` | Estrarre hook + scomporre in componenti | Manutenibilita |
| Medio | `CompanyDetail.tsx` | Estrarre logica in hook `useCompanyDetail` | Manutenibilita |

## Dettagli Tecnici

### Fix immediati (senza refactoring)
1. Rimuovere righe 420-424 in `AdminDashboard.tsx` (bottone "Vedi Ordini Globali")
2. Sostituire `sectorLabels` locale con import da `@/lib/companyUtils`
3. Sostituire `ALL_MODULES` locale in `SubscriptionPlans.tsx` con import da `@/lib/adminConstants`

### Refactoring Dashboard
- Nuovo file: `src/hooks/useAdminDashboardData.ts` (query + calcoli MRR/churn)
- Nuovi componenti in `src/components/admin/dashboard/`:
  - `AdminStatCards.tsx`
  - `AdminMrrStats.tsx`
  - `AdminRecentCompanies.tsx`
  - `AdminRecentActivity.tsx`
  - `AdminQuickActions.tsx`
- `AdminDashboard.tsx` ridotto a circa 60-80 righe

### Refactoring CompanyDetail
- Nuovo file: `src/hooks/useCompanyDetail.ts` (tutte le query, mutations e handler)
- Migrazione fetch azienda da `useEffect` a `useQuery`
- `CompanyDetail.tsx` ridotto a circa 150-200 righe
