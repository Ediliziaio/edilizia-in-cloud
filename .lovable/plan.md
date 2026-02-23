

# Appuntamento visibile sulla Card Opportunita (stile GHL)

## Panoramica

Mostrare sulla card dell'opportunita nella Kanban:
1. L'icona Calendario con badge numerico se il contatto ha un appuntamento futuro
2. Un chip con la data dell'appuntamento (es. "23 Feb, 10:00") come in GHL
3. Click sull'icona Calendario apre il tab appuntamenti nel dialog
4. Il campo "Data appuntamento" e gestibile da "Gestisci campi"

---

## Modifiche ai file

### 1. `src/hooks/useOpportunitiesData.ts` - Fetch appuntamenti

Nella funzione `useOpportunities`, aggiungere una query per recuperare il prossimo appuntamento futuro per ogni contatto:

- Raccogliere tutti i `contact_id` dalle opportunita
- Query su `appointments` con `contact_id IN (...)`, `appointment_date >= oggi`, `status != 'annullato'`, ordinato per data ASC
- Creare una mappa `contactId -> { date, time }` con il primo appuntamento futuro
- Arricchire ogni opportunita con `next_appointment: { date, time } | null`

### 2. `src/components/opportunities/OpportunityCard.tsx` - Visualizzazione

- **Icona Calendario**: sostituire `handleComingSoon("Calendario")` con apertura del tab `appointments` via `onOpenTab?.("appointments")`
- **Badge sull'icona**: se `opportunity.next_appointment` esiste, mostrare badge numerico (1)
- **Chip data appuntamento**: sotto le icone (o inline con esse), se il campo `appointment_date` e attivo e l'appuntamento esiste, mostrare un chip stile GHL con bordo arrotondato e icona calendario + data formattata (es. "23 Feb, 10:00")

### 3. `src/hooks/useCardFieldPreferences.tsx` - Nuovo campo

Aggiungere a `BUILT_IN_FIELDS`:
```
{ key: "appointment_date", label: "Data appuntamento", section: "other" }
```

### 4. `src/components/opportunities/OpportunityCard.tsx` - CardDetailRows

Aggiungere nel `fieldMap` del componente `CardDetailRows` il campo `appointment_date` che mostra la data del prossimo appuntamento come chip stilizzato (sfondo chiaro, bordo, icona calendario).

---

## Riepilogo

| File | Azione |
|------|--------|
| `src/hooks/useOpportunitiesData.ts` | Modifica: fetch prossimo appuntamento per contatto |
| `src/hooks/useCardFieldPreferences.tsx` | Modifica: aggiungere campo `appointment_date` |
| `src/components/opportunities/OpportunityCard.tsx` | Modifica: badge calendario, chip data, click apre tab |
| Database | Nessuna modifica |
