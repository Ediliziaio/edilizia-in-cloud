

# Fix config.toml — Unico intervento rimanente

## Stato attuale

| Fix | Stato |
|-----|-------|
| config.toml entry | **Mancante** — la function non si deploya |
| getClaims→getUser | Già applicato (riga 392) |
| 3 toggle policy SuperAdmin | Già applicato (GoogleCalendarPoliciesCard) |
| Stato connessione Google Calendar | Già applicato (query gcalConnection) |

## Intervento

Aggiungere al file `supabase/config.toml` l'entry:

```toml
[functions.google-calendar-auth]
verify_jwt = false
```

Questo è l'unico fix rimasto dei 4 identificati. Senza questa entry, la function `google-calendar-auth` non viene deployata e tutto il flusso OAuth Google Calendar non funziona.

## File modificato

| File | Modifica |
|------|----------|
| `supabase/config.toml` | Aggiungere entry `[functions.google-calendar-auth]` |

