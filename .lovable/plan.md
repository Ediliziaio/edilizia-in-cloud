
# Pulizia, Stabilizzazione e UX -- Sezione Admin

## 1. Codice Morto e Pulizia

### Da rimuovere/correggere:

**`useCompanyDetail.ts`:**
- La funzione `handleImpersonateAndNavigate` (riga 343-347) fa `return path` invece di navigare -- e inutile perche `CompanyDetail.tsx` la reimplementa localmente (riga 63-66). Va rimossa dall'hook e dal return.
- Query duplicata: `customersRes` (riga 92) e `profilesRes` (riga 94) interrogano entrambe `profiles` con `company_id = id`. Unificarle in una sola query che restituisce sia il count che gli id.
- Prop `teamData` passata a `CompanyOverviewTab` ma mai letta dal componente -- rimuovere dalla signature e dal passaggio.

**`CompanySubscriptionTab.tsx`:**
- Riga 160: il testo dice "tab Dettagli di base" ma il tab si chiama ora "Dettagli". Correggere.

**`CompanyActivityTab.tsx`:**
- Il file e gia stato eliminato ma `tsconfig.app.tsbuildinfo` potrebbe contenere ancora un riferimento. Nessun import attivo, nessuna azione necessaria nel codice sorgente.

### File coinvolti:
- `src/hooks/useCompanyDetail.ts`
- `src/components/admin/company/CompanyOverviewTab.tsx`
- `src/components/admin/company/CompanySubscriptionTab.tsx`
- `src/pages/admin/CompanyDetail.tsx`

---

## 2. Fix Funzionali

### Stabilita query:
- Aggiungere `staleTime: 2 * 60 * 1000` alle query `teamData`, `recentOrders`, `recentTickets`, `allOrders` nell'hook `useCompanyDetail` per allinearsi alla strategia di caching del progetto e ridurre re-fetch inutili.

### Error handling mutations:
- Aggiungere `onError` a `updateStatusMutation`, `changePlanMutation`, `extendTrialMutation` con toast di errore. Oggi se falliscono l'utente non riceve feedback.

### Edge case "nessun piano":
- In `CompanyOverviewTab`, quando `currentPlan` e null, il LTV viene calcolato come `0 * monthsActive = 0` -- OK, ma mostrare "N/A" invece di "0,00" per evitare confusione.

### Validazione form:
- Il form in `CompanyDetailsTab` ha validazione Zod gia attiva. Verificare che i messaggi di errore siano visibili (lo sono, via `FormMessage`).

---

## 3. Miglioramenti UX

### Feedback immediato:
- Aggiungere toast di errore su tutte le mutation che oggi mancano di `onError`.
- Il bottone "Salva Modifiche" nel tab Dettagli ha gia lo stato loading -- OK.

### Micro-interazione lista aziende:
- La riga espandibile funziona gia con animazione chevron. Aggiungere `transition-all duration-200` al pannello espandibile per un'apertura piu fluida.

### Testo "Dettagli di base" residuo:
- Correggere in "Dettagli" nel `CompanySubscriptionTab` (riga 160) per coerenza con i tab.

### Empty state consistenti:
- Tutti gli empty state sono gia gestiti con icona + testo + CTA dove appropriato.

---

## 4. Dettagli Tecnici delle Modifiche

### `src/hooks/useCompanyDetail.ts`:
1. Rimuovere `handleImpersonateAndNavigate` (righe 343-348) e dal return (riga 492)
2. Unificare query `customersRes` e `profilesRes` in una sola chiamata
3. Aggiungere `staleTime: 2 * 60 * 1000` alle query senza staleTime (`teamData`, `recentOrders`, `recentTickets`, `allOrders`, `currentSubscription`, `subscriptionLogs`)
4. Aggiungere `onError` alle 3 mutation con toast destructive

### `src/components/admin/company/CompanyOverviewTab.tsx`:
1. Rimuovere prop `teamData` dalla interface e dal componente
2. Mostrare "N/A" per LTV quando `mrr === 0`

### `src/pages/admin/CompanyDetail.tsx`:
1. Rimuovere passaggio prop `teamData` a `CompanyOverviewTab`
2. Rimuovere riferimento a `h.handleImpersonateAndNavigate` (non usato direttamente)

### `src/components/admin/company/CompanySubscriptionTab.tsx`:
1. Correggere testo riga 160: "Dettagli di base" diventa "Dettagli"

### `src/pages/admin/CompaniesList.tsx`:
1. Aggiungere `transition-all duration-200` al pannello espandibile per fluidita

---

## 5. Cosa NON cambia

- Nessun comportamento funzionale modificato
- Nessuna migrazione database
- Nessun nuovo file creato
- Struttura tab e navigazione invariata
- Logica di impersonificazione invariata
