

# Piano: Stabilizzazione, Pulizia e QA del Progetto

## Analisi completata

Ho esaminato in dettaglio i file chiave del progetto: routing (App.tsx), autenticazione (AuthContext, Login, ProtectedRoute), il flusso appuntamenti marketing (MarketingCalendar, MarketingAppointmentDialog, CalendarSuggestions, DailyRoutePanel, AddressAutocomplete), l'Edge Function suggest-calendars con scoring e test, e il sistema permessi.

---

## Problemi trovati

### Bug funzionali

| # | Problema | File | Impatto |
|---|---------|------|---------|
| 1 | **End time hardcoded a +30 min quando l'utente cambia manualmente l'ora di inizio** — Riga 571-572 di `MarketingAppointmentDialog.tsx`: `setEndTime(addMinutesToTime(e.target.value, 30))`. Dovrebbe usare la durata del calendario selezionato (`selectedCalendar?.duration_minutes || 60`) come gia fatto in `handleSuggestionSelect`. Stessa cosa nella tab "blocked" riga 684. | `MarketingAppointmentDialog.tsx` | UX inconsistente: se il calendario ha durata 90 min, cambiare l'ora manualmente imposta fine a +30 min |
| 2 | **End time default +30 min alla creazione** — Riga 161: `setEndTime(addMinutesToTime(st, 30))`. Quando si apre il dialog per un nuovo appuntamento, il default dovrebbe rispettare la durata del calendario (ma il calendario potrebbe non essere selezionato ancora, quindi servono 30 min come fallback iniziale, poi aggiornare quando si seleziona calendario). | `MarketingAppointmentDialog.tsx` | Minore — il default 30 e ragionevole come fallback iniziale |
| 3 | **Nessun aggiornamento end time quando si cambia calendario** — Quando l'utente seleziona un calendario diverso manualmente (non via suggerimento), l'end time non si aggiorna con la durata del nuovo calendario. | `MarketingAppointmentDialog.tsx` | UX: l'utente deve aggiornare manualmente l'ora fine |

### Pulizia codice

| # | Problema | File |
|---|---------|------|
| 4 | `Employees` page riga 37: `MARKETING_SECTIONS` e definito ma mai usato nel template | `Employees.tsx` |
| 5 | `useQuery` return type in `interDistances` usa `isFetching: isInterDistLoading` — nome non standard ma funzionale, nessun bug | `MarketingAppointmentDialog.tsx` |

### UX migliorabile

| # | Problema | File |
|---|---------|------|
| 6 | Quando `CalendarSuggestions` ritorna array vuoto (nessun calendario attivo), non viene mostrato alcun messaggio. L'utente non sa se il sistema ha cercato e non trovato nulla, oppure se non ha cercato. | `CalendarSuggestions.tsx` riga 57 |
| 7 | L'end time default nella tab "blocked" usa +30 min (riga 684), che e ragionevole per i blocchi ma potrebbe essere allineato a un default piu lungo (es. 60 min per blocchi tipo "pausa pranzo"). | `MarketingAppointmentDialog.tsx` |

---

## Piano di intervento

### 1. Fix: End time rispetta durata calendario al cambio ora manuale

**File: `MarketingAppointmentDialog.tsx`**

Modificare le righe 570-573 (tab appointment) e 683-686 (tab blocked):
- Quando l'utente cambia l'ora di inizio, calcolare l'end time usando `selectedCalendar?.duration_minutes || 60` invece di 30 fisso
- Solo nella tab appointment (nella tab blocked, 30 min come default e ragionevole)

### 2. Fix: Aggiornare end time quando si cambia calendario

**File: `MarketingAppointmentDialog.tsx`**

Aggiungere un `useEffect` che reagisce al cambio di `calendarId`:
- Se il calendario selezionato ha una `duration_minutes`, ricalcolare `endTime = addMinutesToTime(startTime, duration)`
- Solo se non stiamo editando un appuntamento esistente (per non sovrascrivere dati salvati)

### 3. Pulizia: Rimuovere `MARKETING_SECTIONS` inutilizzato

**File: `Employees.tsx`**

Rimuovere la riga 37 con la definizione di `MARKETING_SECTIONS`.

### 4. UX: Messaggio "nessun risultato" in CalendarSuggestions

**File: `CalendarSuggestions.tsx`**

Riga 57: invece di `return null` quando `suggestions.length === 0`, mostrare un messaggio informativo: "Nessun calendario disponibile per questa data e posizione".
Condizionare: mostrare solo se la query ha effettivamente cercato (non durante il loading iniziale).

### 5. Nessuna modifica necessaria

I seguenti elementi sono stati verificati e risultano corretti:
- **Routing** (`App.tsx`): tutte le rotte sono coerenti e protette
- **Auth flow** (`AuthContext`, `Login`): gestione corretta di session, impersonation, password change
- **Edge Function** (`suggest-calendars`): scoring, debug logging, unit test — tutto operativo
- **AddressAutocomplete**: autocomplete, place details, clear — funzionanti
- **CalendarSuggestions + DailyRoutePanel**: rendering, badge, progress bar, BLOCKED disabilitato — corretti
- **Permessi**: `usePermissions` gestisce correttamente admin/staff/default

---

## Dettaglio tecnico

### Modifica 1 — End time dinamico (riga 570-573)

```typescript
// PRIMA:
if (e.target.value) setEndTime(addMinutesToTime(e.target.value, 30));

// DOPO:
if (e.target.value) {
  const dur = selectedCalendar?.duration_minutes || 60;
  setEndTime(addMinutesToTime(e.target.value, dur));
}
```

### Modifica 2 — useEffect su cambio calendario

```typescript
useEffect(() => {
  if (!isEditing && calendarId && calendarId !== "none") {
    const cal = calendars.find(c => c.id === calendarId);
    if (cal?.duration_minutes && startTime) {
      setEndTime(addMinutesToTime(startTime, cal.duration_minutes));
    }
  }
}, [calendarId]);
```

### Modifica 3 — CalendarSuggestions messaggio vuoto

```typescript
// Riga 57 — invece di return null:
if (suggestions.length === 0) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="text-sm text-muted-foreground">
        Nessun calendario disponibile per questa data e posizione.
      </p>
    </div>
  );
}
```

---

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/marketing/MarketingAppointmentDialog.tsx` | FIX: end time dinamico + useEffect su cambio calendario |
| `src/components/marketing/CalendarSuggestions.tsx` | UX: messaggio "nessun risultato" |
| `src/pages/azienda/Employees.tsx` | PULIZIA: rimuovere `MARKETING_SECTIONS` |

Nessuna migrazione DB. Nessuna modifica al backend.

