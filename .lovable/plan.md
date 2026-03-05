

# Separare appuntamenti Lavori da Marketing nel Calendario

## Problema
La query appuntamenti in `Calendar.tsx` carica **tutti** gli appuntamenti senza filtro. Gli appuntamenti marketing hanno `calendar_id IS NOT NULL`, quelli di lavoro hanno `calendar_id IS NULL`. Attualmente si mescolano.

## Intervento

**File: `src/pages/azienda/Calendar.tsx`** — aggiungere un filtro alla query appuntamenti:

```tsx
.from("appointments")
.select(...)
.eq("company_id", effectiveCompany.id)
.is("calendar_id", null)   // ← esclude gli appuntamenti marketing
```

Un solo filtro, una sola riga. Il Marketing Calendar già filtra con `.not("calendar_id", "is", null)`, quindi la separazione sarà simmetrica.

