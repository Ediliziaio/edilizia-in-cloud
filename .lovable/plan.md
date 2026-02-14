

# Stabilizzazione Sezione Referral

## 1. Bug e Problemi Identificati

### Bug 1: Crash potenziale nella query `referral_companies`
In `ReferralDashboard.tsx` (riga 86), se `data` e un array vuoto, `companyIds` diventa `[]` e la chiamata `.in("id", [])` puo fallire o ritornare errore su alcuni engine Postgres. Stesso problema per `planIds` (riga 92).

**Fix:** Aggiungere guard `if (companyIds.length === 0) return []` prima delle query secondarie.

### Bug 2: Race condition su `total_paid` in PayoutDialog
In `PayoutDialog.tsx` (riga 66), il calcolo `referrer!.total_paid + data.amount` usa il valore dal prop `referrer` che potrebbe essere stale (se l'admin registra due pagamenti di fila senza che la query si aggiorni). Il secondo pagamento sovrascrive il primo.

**Fix:** Usare un update SQL incrementale: `total_paid: referrer!.total_paid + data.amount` va sostituito con una RPC o un approccio che legge il valore corrente. Soluzione pragmatica: dopo il primo insert, ri-fetchare il totale corrente dei payouts e aggiornare `total_paid` come somma.

### Bug 3: PayoutDialog non resetta il form al cambio referrer
Quando si apre il PayoutDialog per un referrer diverso, il form mantiene i valori precedenti. Manca un `useEffect` per resettare il form quando cambia `referrer`.

### Bug 4: `toggleActiveMutation` senza `onError`
In `ReferralDashboard.tsx` (riga 117), la mutation per attivare/disattivare un referrer non ha handler di errore. Se fallisce, l'utente non riceve feedback.

---

## 2. Pulizia Codice

### Nessun codice morto rilevato
Tutti i componenti, import e funzioni nella sezione referral sono utilizzati. Nessuna rimozione necessaria.

---

## 3. Miglioramenti UX

### Caching query
Aggiungere `staleTime: 2 * 60 * 1000` a tutte e 3 le query (`referrers`, `referral_companies`, `referral_payouts`) per coerenza con il resto del progetto e ridurre re-fetch.

### Feedback loading su toggle attivo/inattivo
Il bottone toggle non mostra stato di loading. Aggiungere `disabled` durante la mutation pendente.

### Skeleton loading nella tabella
Sostituire il testo "Caricamento..." con un pattern piu visivo (skeleton rows) coerente con il resto dell'app.

---

## 4. Dettagli Tecnici

### `src/pages/admin/ReferralDashboard.tsx`:
1. Aggiungere `staleTime: 120000` a tutte e 3 le query
2. Aggiungere `onError` con toast destructive a `toggleActiveMutation`
3. Guard su `companyIds.length === 0` nella query `referral_companies`

### `src/components/admin/referral/PayoutDialog.tsx`:
1. Aggiungere `useEffect` che resetta il form quando `referrer` cambia
2. Sostituire l'update stale di `total_paid` con: query somma payouts correnti, poi update

### `src/components/admin/referral/ReferralTable.tsx`:
1. Passare `isToggling` (mutation pending state) per disabilitare i bottoni toggle durante l'operazione

---

## 5. Cosa NON cambia
- Nessun comportamento funzionale modificato
- Nessuna migrazione database
- Nessun nuovo file creato
- Struttura routing e navigazione invariata

