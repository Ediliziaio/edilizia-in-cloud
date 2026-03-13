

## AUT-UNIF-01 — Analisi e Piano Realistico

### Schema Discovery — Stato Attuale

**Tabelle automazioni esistenti (8 tabelle):**

| Tabella | Scopo |
|---|---|
| `automations` | Automazioni semplici (trigger + actions JSONB) |
| `task_automation_rules` | Automazioni specifiche per task |
| `automation_flows` + `automation_nodes` + `automation_connections` + enrollment/log/queue | Flow builder visuale marketing |
| `internal_automation_flows` + `internal_automation_nodes` + `internal_automation_connections` + enrollment/log/queue | Flow builder visuale interno |

**Tabelle AI agents esistenti (8 tabelle):**

| Tabella | Scopo |
|---|---|
| `ai_agents` | Agenti ElevenLabs esterni (voice AI) |
| `ai_agent_conversations`, `ai_agent_knowledge_docs`, `ai_agent_phone_numbers`, `ai_agent_branches`, `ai_agent_credits`, `ai_agent_tests`, `ai_agent_audit_log` | Ecosistema completo agenti |
| `internal_ai_agents` + `internal_agent_actions` | Agenti interni ElevenLabs |

**Sidebar attuale (5 voci in `area_automazioni`):**
1. Automazioni → `/azienda/automazioni` → flow builder visuale interno
2. Automazioni Task → `/azienda/automazioni-task` → regole task
3. Automazioni Marketing → `/azienda/marketing/automazioni` → flow builder marketing
4. Agenti AI → `/azienda/marketing/agente-ai/*` → modulo agenti esterni
5. Agenti AI Interni → `/azienda/agente-interno/*` → modulo agenti interni

---

### Valutazione Critica del Prompt

Il prompt propone di creare **nuove tabelle unificate** (`automation_rules`, `ai_agents` nuova). Questo approccio presenta rischi critici:

- Le tabelle `ai_agents` e `internal_ai_agents` sono integrate con **ElevenLabs** tramite proxy edge function, con 8 tabelle satellite ciascuna
- I flow builder visuali (`automation_flows` + nodes + connections) hanno logica complessa di canvas, nodi, connessioni
- Riscrivere tutto richiederebbe **riscrittura di ~50+ file** tra hooks, componenti, edge functions
- **Alto rischio di regressione** su funzionalità in produzione

### Piano Proposto — Consolidamento UI (no schema change)

**Approccio pragmatico**: consolidare solo la **sidebar e il routing** mantenendo le tabelle e i componenti esistenti. I sotto-moduli vengono resi come tab dentro 2 pagine contenitore.

#### STEP 1 — Sidebar: da 5 a 2 voci

In `src/lib/sidebarConfig.ts`, `area_automazioni`:
```
items: [
  { title: "Automazioni", url: "/azienda/automazioni", icon: Workflow, permissionKey: "canViewSettings" },
  { title: "Agenti AI",   url: "/azienda/agenti-ai",   icon: Bot,      permissionKey: "canViewMarketingAiAgent" },
]
```

#### STEP 2 — Pagina unificata Automazioni con tab

Creare `src/pages/azienda/AutomazioniUnified.tsx` con 3 tab:
- **Operative** → embed `InternalAutomations` (flow builder interno attuale)
- **Task** → embed `TaskAutomationsPage` componente
- **Marketing** → embed `MarketingAutomations` componente

Usa `?tab=` query param per navigazione diretta.

#### STEP 3 — Pagina unificata Agenti AI con tab

Creare `src/pages/azienda/AgentiAIUnified.tsx` con 2 tab:
- **Agenti Esterni** → embed `AIAgentsModule`
- **Agenti Interni** → embed `InternalAIAgentsModule`

Usa `?tipo=platform|custom` query param.

#### STEP 4 — Routing aggiornato

In `src/routes/companyRoutes.tsx`:
```typescript
// Rotte principali
<Route path="automazioni" element={<AutomazioniUnified />} />
<Route path="automazioni/:id" element={<AutomazioniUnified />} />
<Route path="agenti-ai/*" element={<AgentiAIUnified />} />

// Redirect retrocompatibili
<Route path="automazioni-task" element={<Navigate to="/azienda/automazioni?tab=task" replace />} />
<Route path="automazioni-legacy" element={<Navigate to="/azienda/automazioni?tab=operative" replace />} />
<Route path="marketing/automazioni" element={<Navigate to="/azienda/automazioni?tab=marketing" replace />} />
<Route path="marketing/agente-ai/*" element={<Navigate to="/azienda/agenti-ai?tipo=custom" replace />} />
<Route path="agente-interno/*" element={<Navigate to="/azienda/agenti-ai?tipo=platform" replace />} />
```

#### STEP 5 — Aggiornare flat items e admin routes

Aggiornare le reference in `internalItems`, `marketingItems` e `adminRoutes.tsx`.

---

### File coinvolti

| File | Azione |
|---|---|
| `src/lib/sidebarConfig.ts` | Modifica sidebar 5→2 voci |
| `src/pages/azienda/AutomazioniUnified.tsx` | Nuovo — pagina tab container |
| `src/pages/azienda/AgentiAIUnified.tsx` | Nuovo — pagina tab container |
| `src/routes/companyRoutes.tsx` | Aggiorna rotte + redirect |
| `src/routes/adminRoutes.tsx` | Aggiorna rotte admin parallele |

### Nessuna migrazione DB necessaria

Le tabelle esistenti rimangono invariate. Tutta la logica di business, hooks, edge functions continua a funzionare.

