

# Audit, pulizia e stabilizzazione del progetto

## Risultati dell'analisi

Dopo aver analizzato ~30 componenti, ~28 hook, ~15 file lib, tutte le route in App.tsx, e i file del calendario, il progetto risulta **già molto pulito** grazie all'audit precedente. Ho identificato solo pochi elementi da rimuovere e miglioramenti UX minori.

---

## 1) Codice morto da rimuovere

### `src/App.tsx` — riga 82
- `const Employees = lazy(...)` importato ma **mai usato in nessuna Route**. La pagina `Employees` è usata solo tramite import diretto in `SettingsStaff.tsx`, quindi il lazy import in App.tsx è codice morto.

### `src/pages/azienda/Calendar.tsx` — riga 1
- `useCallback` importato da React ma **mai utilizzato** nel componente.

---

## 2) Fix funzionali

### Nessun bug critico individuato
- Le query sono tutte protette da `enabled: !!companyId`
- Gli stati sono gestiti correttamente (reset su close del dialog, ecc.)
- Le validazioni negli AppointmentDialog coprono i casi obbligatori
- Non ci sono race condition evidenti
- Console pulita (0 errori rilevati)

---

## 3) Miglioramenti UX

### CalendarMonthView — feedback visivo sul click
- Attualmente il `cursor-pointer` e `hover:bg-muted/30` sono già presenti (aggiunta recente). La UX è già fluida.

### Nessun vicolo cieco rilevato
- Tutti i loading state sono gestiti (spinner, error state con retry)
- I dialog hanno sempre CTA "Annulla" e azione principale
- La pagina calendario ha fallback per errori con pulsante "Riprova"

---

## 4) Piano di implementazione

Le modifiche sono minime e sicure:

1. **Rimuovere riga 82 di App.tsx** — `const Employees = lazy(...)` (import non usato)
2. **Rimuovere `useCallback` dalla riga 1 di Calendar.tsx** — import non usato

Nessun cambiamento funzionale. Solo pulizia di 2 import inutili.

---

## 5) Conferma

Il progetto è in buone condizioni:
- Nessun file orfano
- Nessun componente inutilizzato
- Nessun hook morto
- Tutti i lib file sono referenziati
- Le edge function sono tutte collegate a funzionalità attive
- Le route sono coerenti con i lazy import (eccetto l'Employees trovato)
- Console pulita, nessun warning runtime

