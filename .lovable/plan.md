

# Verifica Sistema Crediti — Risultati e Fix per Scalabilità

## Stato attuale: funzionante ✅

Il sistema crediti è **correttamente collegato** end-to-end:

- **Database**: 4 tabelle (`ai_credits`, `ai_credit_topups`, `ai_credit_usage`, `platform_pricing`) con tutti gli indici necessari e RLS policies corrette
- **Edge Functions**: `check-credits-before-call`, `topup-credits`, `elevenlabs-webhook` — tutte registrate in config.toml con `verify_jwt = false`
- **Frontend**: `AgentCreditsPage` con saldo, ricarica manuale, storico, utilizzo per agente — tutto collegato ai dati reali
- **PlatformSettingsPage**: pricing table editabile inline con markup globale
- **Vista aggregata**: `monthly_billing_summary` presente per report SuperAdmin
- **Trigger**: `init_company_credits` crea automaticamente il wallet quando si crea un'azienda
- **Nessun errore console**

## Problemi trovati

### 1. Import duplicato in AgentCreditsPage (bug cosmetico)
Riga 1 importa `useState` e riga 24 importa `useState as useReactState`. Funziona ma è codice sporco.

### 2. Race condition nel webhook — NON scalabile per 1000 aziende
**Questo è il problema critico.** Il webhook legge `balance_eur`, calcola il nuovo saldo, e fa UPDATE. Se 2 chiamate della stessa azienda finiscono nello stesso istante, entrambe leggono lo stesso saldo e una delle due deduzioni viene persa.

Con 1000 aziende × N agenti × chiamate concorrenti, questo succederà sicuramente.

**Fix**: Usare un UPDATE atomico con sottrazione diretta:
```sql
UPDATE ai_credits
SET balance_eur = balance_eur - $cost,
    total_spent_eur = total_spent_eur + $cost
WHERE company_id = $id
RETURNING balance_eur;
```
Invece dell'attuale: leggi → calcola → scrivi (non atomico).

### 3. `useUsageByAgent` scarica TUTTI i record senza limite
La query `ai_credit_usage` in `useUsageByAgent` non ha `.limit()`. Con 1000 aziende e migliaia di chiamate al mese, questa query diventa pesantissima.

**Fix**: Aggiungere `.limit(1000)` e filtrare per mese corrente.

### 4. Webhook non fa tenant scoping per `total_spent_eur`
Il campo `total_spent_eur` viene letto con un cast `as Record<string, number>` senza garanzie di tipo. Minore, ma da pulire.

## Piano Fix (4 modifiche)

### Fix 1: Webhook — UPDATE atomico per evitare race conditions
Riscrivere la sezione deduct balance nel webhook per usare un singolo UPDATE con aritmetica SQL, eliminando il read-then-write. Usare `RETURNING balance_eur` per sapere il saldo dopo.

### Fix 2: AgentCreditsPage — Pulire import duplicato
Rimuovere `import { useEffect, useState as useReactState }` e usare `useState` già importato.

### Fix 3: useUsageByAgent — Limitare query e filtrare per mese
Aggiungere filtro `created_at >= inizio mese` e `.limit(1000)` per evitare query enormi.

### Fix 4: useAgentCredits — Aggiungere `staleTime` per ridurre query
Con 1000 aziende, ridurre le richieste inutili aggiungendo `staleTime: 30_000` alle query crediti.

## File da modificare

- `supabase/functions/elevenlabs-webhook/index.ts` — UPDATE atomico
- `src/modules/ai-agents/pages/AgentCreditsPage.tsx` — fix import
- `src/modules/ai-agents/hooks/useAgentCredits.ts` — limit + staleTime + filtro mese

