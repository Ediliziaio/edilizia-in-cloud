

# Audit Cruscotto Aziendale — Report e Piano Interventi

## Report AS-IS

Il Cruscotto e' in buono stato architetturale: 12 componenti modulari, tutti wrappati in `React.memo`, con loading/error states, layout gerarchico CEO-first. Il data layer usa 3 query parallele (`marketing RPC`, `operations`, `finance`) con `staleTime: 120s`. Multi-tenancy correttamente applicata via `companyId` su tutte le query.

---

## Interventi Identificati

### P0 — Unused Imports (Dead Code)

| File | Problema |
|------|----------|
| `ExecutiveOverview.tsx` riga 5 | `BarChart3` importato ma mai usato nel componente |
| `FinanzaCashFlow.tsx` riga 4 | `Progress` importato da radix ma non usato (barra custom con div) |
| `MarketingControl.tsx` riga 2 | `Card`, `CardContent`, `CardHeader`, `CardTitle` importati ma mai usati |

### P1 — Performance: Query N+1 in Finance

Il `financeData` query in `useCruscottoData.ts` esegue 4 query separate (`currentOrders` con join, `prevOrders` con join, `pendingRes`, `costsRes`). Sono gia' in `Promise.all` quindi parallele — nessun N+1 reale. Tuttavia il `pendingRes` scarica TUTTI gli ordini dell'azienda per calcolare i pagamenti scaduti. Su aziende con 1000+ ordini questo puo' essere pesante.

**Fix**: aggiungere filtro `.or('deposit_paid.eq.false,deposit_2_paid.eq.false,balance_paid.eq.false,financing_paid.eq.false')` alla query `pendingRes` per scaricare solo ordini con almeno un pagamento non saldato.

### P1 — Stessa query duplicata in Operations

La query `overdueRes` in operations scarica gli stessi campi di `pendingRes` in finance. Entrambe scaricano TUTTI gli ordini dell'azienda con i campi di pagamento.

**Fix**: Consolidare in una singola query condivisa, calcolando sia `overduePayments`/`overdueAmount` sia `pendingRevenue`/`thisMonthIncome` dallo stesso risultato.

### P2 — UX: `stale_leads_2h` e `pending_appointments` non usati

La RPC `get_marketing_dashboard_stats` ritorna `stale_leads_2h` e `pending_appointments` negli alerts, ma `CruscottoAlerts.tsx` non li mostra. Sono alert utili che andrebbero visualizzati.

### P2 — Security: `any` cast in operations query

`useCruscottoData.ts` riga 99: `let q: any = supabase.from(...)` — perde il type-checking. Dovrebbe usare il tipo corretto.

---

## Piano di Intervento (5 modifiche)

### 1. Rimuovere import inutilizzati (3 file)
- `ExecutiveOverview.tsx`: rimuovere `BarChart3` dalla lista import
- `FinanzaCashFlow.tsx`: rimuovere `Progress` dalla lista import
- `MarketingControl.tsx`: rimuovere import `Card, CardContent, CardHeader, CardTitle`

### 2. Ottimizzare query payments in `useCruscottoData.ts`
- Aggiungere filtro sulla query `pendingRes` per escludere ordini con tutti i pagamenti gia' saldati
- Consolidare `overdueRes` (operations) e `pendingRes` (finance) in una singola query condivisa per eliminare il download duplicato
- Rimuovere il cast `any` dalla query operations

### 3. Aggiungere alert mancanti in `CruscottoAlerts.tsx`
- Mostrare `stale_leads_2h` come alert "info" per lead non contattati da 2h
- Mostrare `pending_appointments` come alert "warning" per appuntamenti non completati

### 4. Nessun intervento necessario su:
- Multi-tenancy: tutte le query sono gia' tenant-scoped via `companyId`
- Sicurezza: RLS attivo, dati filtrati server-side
- Backup: gestito da Lovable Cloud (giornaliero, PITR)
- Auth/RBAC: `can_view_cruscotto` gia' verificato a livello routing

