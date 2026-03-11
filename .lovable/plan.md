

# Fix: Lead Temperature mostra "999gg" per contatti nuovi

## Problema
La funzione `getLeadTemperature()` riceve `lastActivityDate` e `lastContactedDate`. Se entrambi sono `null` (contatto appena creato, nessuna attività registrata), il fallback è `999` giorni — quindi mostra "Inattivo ❄️ Fermo da 999gg" anche per un lead creato oggi.

## Soluzione
Usare la **data di creazione del contatto** (`created_at`) come fallback quando non ci sono date di attività o contatto. Un lead appena creato senza attività dovrebbe risultare "Caldo" o "Tiepido", non "Inattivo da 999gg".

## Modifiche

### 1. `src/lib/leadTemperature.ts`
- Aggiungere un parametro `createdAt: Date | null` alla funzione
- Includere `createdAt` nell'array di date candidate come fallback (dopo lastActivityDate e lastContactedDate)

### 2. `src/components/marketing/LeadTemperatureBadge.tsx`
- Aggiungere prop `createdAt?: string | null`
- Passarla a `getLeadTemperature()`

### 3. `src/components/opportunities/OpportunityCard.tsx`
- Passare `contact.created_at` (o `opportunity.created_at`) come fallback al badge

### 4. `src/components/marketing/ContactsTable.tsx`
- Passare `contact.created_at` al `LeadTemperatureBadge`

