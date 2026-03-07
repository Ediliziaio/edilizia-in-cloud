

# Widget Crediti Email nella pagina Email Marketing

## Obiettivo
Aggiungere un banner/widget in cima alla pagina `EmailMarketing.tsx` che mostra saldo crediti email, totale speso, totale ricaricato e stato blocco invii. Usa la tabella `email_credits` già esistente.

## Implementazione

### 1. Nuovo componente `src/components/email-marketing/EmailCreditsWidget.tsx`
- Fetch da `email_credits` filtrando per `company_id` (da `useAuth().effectiveCompany.id`)
- Card con 3 stat inline: **Saldo** (`balance_eur`), **Speso** (`total_spent_eur`), **Ricaricato** (`total_recharged_eur`)
- Progress bar (speso/ricaricato) con colori a soglia (verde/ambra/rosso)
- Banner di warning se `sends_blocked = true`
- Riutilizza `CreditUsageBar` e `formatEur` dal modulo AI agents

### 2. Modifica `src/pages/azienda/marketing/EmailMarketing.tsx`
- Importa e renderizza `EmailCreditsWidget` sopra i tabs

### Nessuna modifica DB necessaria
Le tabelle `email_credits` e `email_pricing` esistono già con RLS.

