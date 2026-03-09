

# Piano di Implementazione - Risoluzione Bug Identificati + Configurazione CRON_SECRET

## Obiettivo
Implementare tutti i fix critici identificati nell'audit (P0 e P1) + aggiungere la possibilità di configurare il `CRON_SECRET` dall'interfaccia Super Admin.

---

## 1. Timeline Unificata - Fix `direction` Messaggi

**Bug**: `(msg as any).direction` è `undefined` perché la colonna non esiste in `contact_messages`.

**Soluzione**: Derivare direction da `sent_by`:
```typescript
const direction = msg.sent_by ? "outbound" : "inbound";
```

**File**: `src/components/marketing/UnifiedContactTimeline.tsx`
- Riga 229: Sostituire `const direction = (msg as any).direction;` con logica derivata

---

## 2. Import CSV - Fix Duplicati Interni Non Rimossi

**Bug**: I duplicati rilevati vengono loggati in `errors[]` ma non vengono effettivamente rimossi dall'array `parsed`, quindi vengono creati come nuove righe.

**Soluzione**: Dopo il loop di rilevamento duplicati (riga 650-660), filtrare `parsed` per rimuovere le righe duplicate dalla seconda occorrenza in poi.

**File**: `src/pages/azienda/marketing/MarketingContacts.tsx`
- Righe 650-660: Aggiungere Set per tracciare email già viste e rimuovere duplicati da `parsed`

---

## 3. Export CSV - Applicare `search` ai Filtri

**Bug**: La stringa di ricerca attiva nella barra principale (`search`) non viene applicata alla query di export.

**Soluzione**: Aggiungere un filtro `.or()` sulla query principale quando `search` non è vuoto.

**File**: `src/pages/azienda/marketing/MarketingContacts.tsx`
- Funzione `doExport`, riga 157-162: Aggiungere controllo `if (search)` e applicare filtro testuale su first_name/last_name/email

---

## 4. Export CSV - Chunking per `.in()` Query

**Bug**: Query `.in("contact_id", ids)` per i custom field values non ha chunking, può superare i limiti Supabase con grandi dataset.

**Soluzione**: Implementare loop di chunking con batch size 2000.

**File**: `src/pages/azienda/marketing/MarketingContacts.tsx`
- Riga 199-202: Sostituire query singola con loop di chunking

---

## 5. A/B Testing - Clamp `ab_split_percent`

**Bug**: Se `ab_split_percent` è 0, `recipientsA` risulta vuoto e tutto viene inviato a variante B.

**Soluzione**: Aggiungere validazione per clampare il valore tra 10 e 90.

**File**: `supabase/functions/send-email-campaign/index.ts`
- Riga 191: Aggiungere `const abSplitPercent = Math.max(10, Math.min(90, campaign.ab_split_percent ?? 50));`

---

## 6. A/B Results - Auto-Refresh con `refetchInterval`

**Bug**: Le statistiche A/B non si aggiornano automaticamente quando il cron determina il vincitore.

**Soluzione**: Aggiungere `refetchInterval: 60000` e `refetchIntervalInBackground: false` alla query.

**File**: `src/components/email-marketing/CampaignAbResults.tsx`
- Riga 39-63: Aggiungere opzioni refetch alla useQuery esistente

---

## 7. Determine Winner Cron - Sicurezza CRON_SECRET

**Problema**: La Edge Function `determine-ab-winner` è esposta pubblicamente senza autenticazione.

**Soluzione Multi-Step**:

### A. Backend - Aggiungere Validazione Edge Function
**File**: `supabase/functions/determine-ab-winner/index.ts`
```typescript
// All'inizio della funzione (dopo OPTIONS)
const cronSecret = req.headers.get("x-cron-secret");
const expectedSecret = Deno.env.get("CRON_SECRET");

if (expectedSecret && cronSecret !== expectedSecret) {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### B. Frontend - Aggiungere UI per Configurazione CRON_SECRET
**File**: `src/components/admin/settings/AdminSettingsIntegrations.tsx`

Aggiungere:
- Un nuovo campo `cron_secret` nello state `values`
- Una nuova Card "Sicurezza Automazioni" con:
  - Input per `cron_secret` con toggle show/hide
  - Pulsante "Genera Automatico" per creare un secret casuale
  - Descrizione: "Token di sicurezza per proteggere i cron job automatici (A/B Testing, Trial Expiry, ecc.)"
- Aggiornare `META_KEYS` in `const ALL_KEYS = [...META_KEYS, "cron_secret"]`
- Aggiornare `useEffect` per caricare anche `cron_secret`
- Aggiornare `handleSave` per salvare anche `cron_secret` in `platform_settings`

### C. Database - Update Migration Cron Job
**NON POSSIAMO** modificare il cron esistente via SQL migration (contiene dati specifici del progetto).

**ALTERNATIVA**: Documentare che l'admin deve aggiungere manualmente l'header al cron job esistente tramite dashboard Supabase o SQL editor:

```sql
-- Aggiornare il cron job esistente per includere x-cron-secret header
-- NOTA: Eseguire manualmente via Supabase SQL Editor
UPDATE cron.job
SET command = $$
  select net.http_post(
    url:='https://guqgszwelffntrgtsycm.supabase.co/functions/v1/determine-ab-winner',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.anon_key'),
      'x-cron-secret', (SELECT value FROM platform_settings WHERE key = 'cron_secret')
    ),
    body:=jsonb_build_object('time', now())
  ) as request_id;
$$
WHERE jobname = 'determine-ab-winner-hourly';
```

**PROBLEMA**: Non possiamo automatizzare questo update perché il cron job potrebbe non esistere o potrebbe avere un URL diverso.

**SOLUZIONE MIGLIORE**: 
1. Aggiungere l'UI per configurare il secret
2. Aggiungere una Card "Istruzioni Cron Job" che mostra:
   - Lo snippet SQL da copiare/incollare con il secret configurato
   - Link alla documentazione Supabase per i cron job
   - Badge di stato "Configurato" / "Da Configurare" basato sulla presenza del secret

---

## 8. Determine Winner - Gestire `completed_at = NULL`

**Bug**: Campagne con `completed_at` NULL non vengono mai processate dal cron.

**Soluzione**: Cambiare il filtro da `.not("completed_at", "is", null)` per gestire anche le campagne fallite parzialmente.

**File**: `supabase/functions/determine-ab-winner/index.ts`
- Riga 22: Aggiungere logica alternativa per campagne senza `completed_at` usando `sent_at` + safe guard

---

## Struttura Files Modificati

```
src/
├── components/
│   ├── marketing/
│   │   └── UnifiedContactTimeline.tsx    [FIX: direction derivato]
│   ├── email-marketing/
│   │   └── CampaignAbResults.tsx         [ADD: refetchInterval]
│   └── admin/
│       └── settings/
│           └── AdminSettingsIntegrations.tsx  [ADD: CRON_SECRET UI + Card]
├── pages/
│   └── azienda/
│       └── marketing/
│           └── MarketingContacts.tsx     [FIX: duplicati, search, chunking]
supabase/
└── functions/
    ├── send-email-campaign/
    │   └── index.ts                      [FIX: ab_split clamp]
    └── determine-ab-winner/
        └── index.ts                      [ADD: CRON_SECRET validation, FIX: completed_at null]
```

---

## Dettaglio Implementazione CRON_SECRET UI

### Card "Sicurezza Automazioni"

**Posizionamento**: Dopo la card Meta in `AdminSettingsIntegrations.tsx`

**Contenuto**:
1. **Header**: "Sicurezza Automazioni" + descrizione breve
2. **Input Field**: 
   - Label: "CRON Secret Token"
   - Type: password con toggle eye icon
   - Placeholder: "Lascia vuoto per disabilitare la verifica"
   - Helper text: "Token di sicurezza per proteggere le edge functions schedulate (A/B test winner, auto-expire trials, ecc.)"
3. **Generate Button**: 
   - Label: "Genera Automatico"
   - Action: Crea un UUID o stringa random di 32 caratteri
4. **Instructions Accordion**:
   - Title: "Istruzioni Configurazione Cron Job"
   - Content: SQL snippet con placeholder `{{CRON_SECRET}}` sostituito dal valore attuale
   - Copy button per copiare lo snippet
   - Badge status: "Secret Configurato" (green) se non vuoto, "Secret Non Configurato" (yellow) se vuoto

---

## Testing Plan

### Automatico (dopo deployment)
1. Verificare che la timeline mostri correttamente "inviato/ricevuto" sui messaggi
2. Verificare che l'import CSV rimuova i duplicati interni dal file
3. Verificare che l'export CSV rispetti la stringa di search attiva
4. Verificare che l'export CSV non crashi con >5000 contatti
5. Verificare che il cron job A/B winner funzioni senza secret (backward compatibility)

### Manuale (da parte dell'utente)
1. Generare un CRON_SECRET dall'interfaccia admin
2. Copiare lo snippet SQL e eseguirlo su Supabase
3. Verificare che il cron job continui a funzionare con il secret configurato
4. Verificare che chiamate senza header `x-cron-secret` vengano rifiutate (401)

---

## Note di Sicurezza

- Il CRON_SECRET viene salvato in `platform_settings` come testo semplice (non encrypted)
- È accessibile solo ai Super Admin tramite RLS policies
- La validazione nella Edge Function è opzionale (se `CRON_SECRET` env var non è impostata, viene saltata)
- Backward compatibility: vecchi cron job senza header continuano a funzionare se il secret non è configurato

---

## Ordine di Implementazione

1. ✅ Fix Timeline (direction) - P0, immediato
2. ✅ Fix Import (duplicati) - P0, immediato  
3. ✅ Fix Export (search + chunking) - P1, importante
4. ✅ Fix A/B Split (clamp) - P1, importante
5. ✅ Fix A/B Results (refetch) - P1, UX
6. ✅ Add CRON_SECRET UI - P2, sicurezza
7. ✅ Add CRON_SECRET validation - P2, sicurezza
8. ✅ Fix Determine Winner (completed_at null) - P2, edge case

