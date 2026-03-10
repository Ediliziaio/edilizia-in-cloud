

# Audit — Automazioni Interne + Agenti AI Interni

## Stato attuale verificato

I file principali sono stati analizzati:
- `src/hooks/useInternalAutomations.ts` — CRUD flows, nodes, connections
- `src/modules/ai-agents-internal/hooks/useInternalAgents.ts` — CRUD agenti con sync ElevenLabs
- `src/pages/azienda/InternalAutomations.tsx` — Builder + List view
- `src/modules/ai-agents-internal/pages/InternalAgentEditorPage.tsx` — Editor agente
- `src/modules/ai-agents-internal/pages/InternalAgentsListPage.tsx` — Lista agenti
- `src/lib/queryKeys.ts` — Factory centralizzata

---

## Bug trovati

### Bug 1 (P0): Save builder non atomico — dati persi su errore intermedio
**File:** `src/hooks/useInternalAutomations.ts`, righe 172-214
Il `useSaveInternalNodes` esegue 4 operazioni sequenziali senza transazione:
1. DELETE connections
2. DELETE nodes
3. INSERT nodes
4. INSERT connections

Se il DELETE riesce ma l'INSERT fallisce, il flow resta **vuoto** — tutti i nodi e connessioni persi. Nessun rollback. L'errore sulla riga 197 (`if (ne) throw ne`) arriva dopo che i delete hanno già svuotato il flow.

**Fix:** Creare una RPC `save_internal_automation_nodes` che esegua delete+insert in una singola transazione atomica. Se l'insert fallisce, il rollback ripristina i dati originali.

### Bug 2 (P0): Create agente — agente orfano su ElevenLabs se insert locale fallisce
**File:** `src/modules/ai-agents-internal/hooks/useInternalAgents.ts`, righe 44-91
L'agente viene **prima** creato su ElevenLabs (riga 47-56), poi inserito nel DB locale (riga 71-87). Se l'insert locale fallisce (RLS, constraint, errore DB), l'agente resta vivo su ElevenLabs ma non esiste localmente. Nessun cleanup remoto nel catch.

**Fix:** Wrappare in try/catch: se l'insert locale fallisce, tentare `delete_agent` su ElevenLabs per il cleanup. Se il cleanup fallisce, loggare l'errore con `elevenlabs_agent_id` per tracciabilità.

### Bug 3 (P1): Update agente — errore provider ignorato silenziosamente
**File:** `src/modules/ai-agents-internal/hooks/useInternalAgents.ts`, righe 119-130
Il catch vuoto (riga 127-129) ignora completamente il fallimento della sync con ElevenLabs e procede con l'update locale. L'utente vede "Salvato" ma il provider ha ancora i dati vecchi. Nessun warning.

**Fix:** Aggiungere `toast.warning("Configurazione salvata localmente, ma la sincronizzazione con il provider vocale non è riuscita.")` nel catch, e loggare l'errore.

### Bug 4 (P1): Delete agente — errore provider ignorato silenziosamente
**File:** `src/modules/ai-agents-internal/hooks/useInternalAgents.ts`, righe 163-172
Stesso pattern del Bug 3: l'agente viene cancellato localmente ma resta vivo su ElevenLabs se il delete remoto fallisce. Nessun warning.

**Fix:** Aggiungere `toast.warning("Agente eliminato dal sistema, ma potrebbe restare attivo sul provider vocale esterno.")` nel catch, e loggare.

### Bug 5 (P1): useInternalAgents — nessun filtro company_id
**File:** `src/modules/ai-agents-internal/hooks/useInternalAgents.ts`, righe 8-21
La query `useInternalAgents()` fa `.select("*")` senza filtrare per `company_id`. Si affida solo a RLS. Il codice dovrebbe aggiungere il filtro esplicitamente per defense-in-depth, come fa `useInternalAutomationFlows`.

**Fix:** Aggiungere `.eq("company_id", companyId)` usando `effectiveCompany` dal contesto auth, come standard del progetto.

### Bug 6 (P1): Persistenza mista nel builder — description viene salvata immediatamente
**File:** `src/pages/azienda/InternalAutomations.tsx`, riga 498
Nel tab "Impostazioni", la modifica della descrizione chiama `updateFlow.mutate({ description: e.target.value })` **ad ogni keystroke**. Questo:
- Persiste immediatamente senza attendere il click "Salva"
- Non imposta `dirty = true`, quindi l'utente non vede che ci sono modifiche non salvate
- Comportamento incoerente: il nome è dirty-tracked, la descrizione no

**Fix:** Allineare la descrizione alla stessa logica del nome: stato locale + dirty tracking + salvataggio al click "Salva".

### Bug 7 (P1): trigger_type persistito subito, nodi no
**File:** `src/pages/azienda/InternalAutomations.tsx`, riga 282
In `handleSelectTrigger`, `updateFlow.mutate({ trigger_type: item.id })` persiste immediatamente il trigger_type nel DB, ma il nodo trigger viene aggiunto solo in `localNodes` (non persistito fino al click "Salva"). Se l'utente chiude senza salvare, il flow ha `trigger_type` nel DB ma nessun nodo trigger nel canvas.

**Fix:** Rimuovere la mutazione immediata di `trigger_type` e includerlo nel salvataggio atomico insieme ai nodi.

### Bug 8 (P2): Query key inline per agenti interni
**File:** `src/modules/ai-agents-internal/hooks/useInternalAgents.ts`
Usa `["internal-ai-agents"]` inline ovunque, non la factory `queryKeys`. Viola lo standard di progetto e impedisce invalidazione centralizzata.

**Fix:** Aggiungere `internalAgents` alla factory in `queryKeys.ts` e usarla nel hook.

---

## Piano correzioni

### 1. Creare RPC `save_internal_automation_nodes` (migration)
```sql
CREATE OR REPLACE FUNCTION public.save_internal_automation_nodes(
  p_flow_id uuid,
  p_company_id uuid,
  p_nodes jsonb,
  p_connections jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM internal_automation_connections WHERE flow_id = p_flow_id;
  DELETE FROM internal_automation_nodes WHERE flow_id = p_flow_id;
  
  IF jsonb_array_length(p_nodes) > 0 THEN
    INSERT INTO internal_automation_nodes (id, flow_id, company_id, node_type, config_json, label, position_x, position_y)
    SELECT ... FROM jsonb_to_recordset(p_nodes);
  END IF;
  
  IF jsonb_array_length(p_connections) > 0 THEN
    INSERT INTO internal_automation_connections (id, flow_id, company_id, from_node_id, to_node_id, label)
    SELECT ... FROM jsonb_to_recordset(p_connections);
  END IF;
END;
$$;
```

### 2. Aggiornare `useInternalAutomations.ts`
- `useSaveInternalNodes`: usare la RPC atomica al posto di 4 query sequenziali
- Includere `trigger_type` e `name` nel salvataggio atomico (evitare persistenza parziale)

### 3. Aggiornare `useInternalAgents.ts`
- `useCreateInternalAgent`: cleanup ElevenLabs se insert locale fallisce
- `useUpdateInternalAgent`: warning toast nel catch + logging
- `useDeleteInternalAgent`: warning toast nel catch + logging
- `useInternalAgents`: aggiungere filtro `company_id`
- Usare `queryKeys` factory

### 4. Aggiornare `InternalAutomations.tsx`
- Rimuovere `updateFlow.mutate({ trigger_type })` da `handleSelectTrigger`
- Includere trigger_type nel `handleSave`
- Allineare descrizione a dirty tracking
- Aggiungere stato locale per descrizione

### 5. Aggiornare `queryKeys.ts`
- Aggiungere sezione `internalAgents`

---

## Riepilogo modifiche

| File | Fix | Tipo |
|------|-----|------|
| Migration SQL | RPC `save_internal_automation_nodes` | Atomicità |
| `useInternalAutomations.ts` | Usare RPC atomica | Atomicità |
| `useInternalAgents.ts` | Cleanup orfani + warning sync + company_id filter + queryKeys | Sync/Isolamento |
| `InternalAutomations.tsx` | Persistenza coerente trigger_type + description | Coerenza |
| `queryKeys.ts` | Aggiungere `internalAgents` | Standard |

5 file, 8 bug corretti. Nessun cambio UX sostanziale. Nessun rischio di regressione.

