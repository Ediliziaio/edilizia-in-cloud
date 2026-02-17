
# Miglioramento Sezione Piani Tariffari

## Problema
La pagina Piani ha lo stesso bug delle altre sezioni: se la query fallisce, il loader gira all'infinito senza feedback. Manca anche un conteggio di quante aziende usano ciascun piano.

## Interventi

### File: `src/pages/admin/SubscriptionPlans.tsx`

**1. Gestione errore sulla query**
- Estrarre `isError` e `refetch` dalla query `subscription-plans`
- Aggiungere stato errore con `Alert` + tasto "Riprova" (stesso pattern gia usato in CompaniesList, AdminSupportChatList)

**2. Conteggio aziende per piano**
- Nuova query su `companies` per contare quante aziende usano ciascun piano (`subscription_plan_id`)
- Mostrare il conteggio nella card di ogni piano (es. "3 aziende attive")

**3. Stat cards in cima alla pagina**
Aggiungere una riga di statistiche riepilogative sopra la griglia piani:
- **Piani attivi**: conteggio piani con `is_active = true`
- **Aziende abbonate**: totale aziende con un piano assegnato
- **MRR totale stimato**: somma `price_monthly` dei piani pesata per numero aziende

## Riepilogo modifiche

| File | Azione |
|------|--------|
| `SubscriptionPlans.tsx` | + isError/refetch con Alert, + query conteggio aziende per piano, + stat cards riepilogative, + badge "N aziende" su ogni card piano |

## Cosa rimane invariato
- Dialog crea/modifica piano (form completo con moduli, Stripe, features)
- Toggle attiva/disattiva inline
- Griglia piani con prezzi, limiti, moduli e features
