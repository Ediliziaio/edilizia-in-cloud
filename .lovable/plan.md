

# Audit — Marketing Automations Builder

## Bug trovati

### Bug 1 (P0): Publish senza salvare il canvas
**File:** `src/hooks/useAutomationBuilder.ts`, riga 336-357
`togglePublish` chiama `updateFlowMutation.mutateAsync({ status: "published" })` senza prima chiamare `saveAll()`. Se l'utente aggiunge nodi, non salva, poi pubblica — l'automazione viene pubblicata con i nodi vecchi nel DB. I nodi nuovi esistono solo in memoria locale e vengono persi.

**Fix:** In `togglePublish`, chiamare `await saveAll()` prima di `updateFlowMutation.mutateAsync()` quando ci sono modifiche non salvate.

### Bug 2 (P1): Query flow/nodes/connections senza filtro company_id
**File:** `src/hooks/useAutomationBuilder.ts`, righe 47-86
Le tre query (flow, nodes, connections) filtrano solo per `id` o `flow_id`, senza `.eq("company_id", ...)`. Defense-in-depth mancante.

**Fix:** Aggiungere `.eq("company_id", effectiveCompany.id)` dove disponibile.

### Bug 3 (P1): deleteFlowMutation nel builder non invalida la lista
**File:** `src/components/marketing/automations/AutomationBuilder.tsx`, righe 77-88
Dopo delete, naviga via ma non invalida `["automation-flows"]`. La lista mostra il flow eliminato dalla cache.

**Fix:** Aggiungere invalidazione `["automation-flows"]` in `onSuccess`.

### Bug 4 (P1): saveAll non invalida la lista flows
**File:** `src/hooks/useAutomationBuilder.ts`, riga 232-237
Il save aggiorna `updated_at` del flow ma non invalida `["automation-flows"]`. La lista mostra il vecchio timestamp.

**Fix:** Aggiungere invalidazione `["automation-flows"]` dopo save.

### Bug 5 (P1): Inline query keys non usano la factory
**File:** `src/hooks/useAutomationBuilder.ts`
Usa `["automation-flow", flowId]`, `["automation-nodes", flowId]`, `["automation-connections", flowId]` inline, che non matchano la factory `queryKeys.automations` (che usa `["automations", "flow", flowId]`). Questo crea un doppio standard e impedisce invalidazioni centralizzate.

**Fix:** Allineare le query key del builder alla factory `queryKeys.automations`. Aggiornare la factory se necessario per matchare il pattern esistente, oppure migrare il builder alla factory.

### Bug 6 (P1): Publish dalla lista bypassa la validazione
**File:** `src/components/marketing/automations/AutomationFlowsList.tsx`, righe 387-390
`toggleStatusMutation` cambia status a "published" direttamente senza controllare se il flow ha un trigger. Dalla lista si può pubblicare un flow vuoto.

**Fix:** Prima di pubblicare dalla lista, caricare i nodi e verificare che ci sia almeno un trigger. In alternativa, mostrare un toast di warning.

### Bug 7 (P2): deleteFlowMutation nel builder senza company_id
**File:** `src/components/marketing/automations/AutomationBuilder.tsx`, riga 80
`.delete().eq("id", flowId)` senza company_id.

**Fix:** Aggiungere `.eq("company_id", effectiveCompany.id)`.

---

## Piano correzioni

| File | Fix | Tipo |
|------|-----|------|
| `src/hooks/useAutomationBuilder.ts` | Save before publish + company_id filters + invalidare flows list + usare factory keys | Atomicità/Sicurezza/Cache |
| `src/components/marketing/automations/AutomationBuilder.tsx` | Delete invalida lista + company_id su delete | Cache/Sicurezza |
| `src/components/marketing/automations/AutomationFlowsList.tsx` | Validazione publish dalla lista | Coerenza |
| `src/lib/queryKeys.ts` | Allineare factory keys al pattern builder (se necessario) | Standard |

4 file, 7 bug. Nessun cambio UX. Backward-compatible.

