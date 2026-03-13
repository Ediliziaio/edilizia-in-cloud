

## FLOW-01 — Discovery: Mappa Completa dei Sistemi di Automazione

Ecco l'analisi completa di tutti i sistemi di automazione esistenti nel progetto.

---

### 4 Sistemi Indipendenti Identificati

```text
┌─────────────────────────────────────────────────────────────┐
│                    AutomazioniUnified                        │
│    (Container UI con 4 tab in /automazioni)                 │
├──────────┬──────────┬──────────────┬────────────────────────┤
│Operative │  Task    │  Marketing   │  Regole               │
│(tab)     │(tab)     │(tab)         │(tab)                  │
├──────────┴──────────┴──────────────┴────────────────────────┤
│                                                             │
│  1. OPERATIVE (Internal Automation Builder)                 │
│     DB: internal_automation_flows/nodes/connections/         │
│         enrollments/queue/execution_log                     │
│     Edge Fn: process-internal-automation                    │
│     DB Trigger: trigger_internal_automations (PL/pgSQL)     │
│     RPC: save_internal_automation_nodes                     │
│     Canvas: InternalAutomationCanvas.tsx (custom SVG)       │
│     Hook: useInternalAutomations.ts                         │
│     Trigger catalogo: ordini, ticket, task, magazzino,      │
│                       costi, dipendenti, calendario         │
│     Azioni: create_task, update_order, send_notification,   │
│             create_ticket, webhook, if/else, delay          │
│                                                             │
│  2. TASK (Task Automation Rules)                            │
│     DB: task_automation_rules, task_automation_log          │
│     Nessuna edge function dedicata                          │
│     Modello: trigger → singola azione (crea task)           │
│     UI: cards con preset rules, no builder visuale          │
│     Trigger: contact_created, opportunity_created/changed,  │
│              appointment_confirmed/completed                │
│                                                             │
│  3. MARKETING (Marketing Automation Builder)                │
│     DB: automation_flows/nodes/connections/                  │
│         enrollments/execution_log/queue/trigger_events      │
│     Edge Fn: process-automation (1435 righe, completo)      │
│     Canvas: AutomationCanvas.tsx (custom SVG)               │
│     Hook: useAutomationBuilder.ts (350+ righe)              │
│     Undo/redo, auto-save, keyboard shortcuts                │
│     Enrollment engine con re-enrollment, branching,         │
│     retry, delays, conditions, splits                       │
│     Azioni: email, WhatsApp, SMS, notifiche, CRM,           │
│             tags, opportunities, tasks, webhooks, AI        │
│     Trigger catalogo: contatti, opportunità, appuntamenti,  │
│                        comunicazioni, sistema, AI, social   │
│                                                             │
│  4. REGOLE (Automation Rules — card-based)                  │
│     DB: automation_rules (singola tabella con template)     │
│     Modello: trigger + condizioni + azione + azioni sec.    │
│     UI: card-based con template gallery (20+)               │
│     Categorie: task, marketing, CRM, cantieri, notifiche    │
│     Nessun builder visuale, nessun enrollment engine        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Matrice Comparativa

| Funzionalità | Operative | Task | Marketing | Regole |
|---|---|---|---|---|
| Builder visuale | Si (custom SVG) | No | Si (custom SVG) | No |
| Branching (if/else) | Si | No | Si | No |
| Delay / attese | Si | No | Si | No |
| Enrollment engine | Si (DB trigger) | No | Si (Edge Fn) | No |
| Execution log | Si | Si (basic) | Si | Contatore |
| Queue con retry | Si | No | Si | No |
| Undo/redo | No | No | Si | No |
| Template gallery | No | 4 preset | No | 20+ template |
| Auto-save | No | N/A | Si | N/A |
| Keyboard shortcuts | No | No | Si | No |
| DB Tables | 6 tabelle | 2 tabelle | 7 tabelle | 1 tabella |
| Edge Function | 1 | 0 | 1 | 0 |
| DB Triggers PG | Si | No | No | No |

### Sovrapposizioni e Ridondanze

1. **Canvas duplicato**: `AutomationCanvas.tsx` e `InternalAutomationCanvas.tsx` sono quasi identici (~90% codice uguale): pan, zoom, drag, SVG connections, stessa struttura
2. **Node component duplicato**: `AutomationNode.tsx` e `InternalAutomationNode.tsx` — stessa struttura, diversi cataloghi
3. **Connection line duplicato**: `AutomationConnectionLine.tsx` e `InternalConnectionLine.tsx` — identici
4. **Task automations ridondante**: il sistema Task è un sottoinsieme delle Regole (stessi trigger, una sola azione "crea task")
5. **Regole vs builder**: le Regole (card-based) sono automazioni semplici che potrebbero essere flussi a 2 nodi nei builder

### Punti di Unificazione Reali

| Opportunità | Rischio | Impatto |
|---|---|---|
| Unificare i canvas (un solo componente condiviso) | Basso | Elimina ~500 righe duplicate |
| Unificare node + connection components | Basso | Elimina ~200 righe duplicate |
| Assorbire Task automations nelle Regole | Medio | Elimina 2 tabelle + 1 page |
| Unificare i due builder in uno | Alto | Richiede merge di 2 edge functions e 13 tabelle |

### Raccomandazione: Piano di Azione Progressivo

**Fase 1 — Canvas condiviso** (basso rischio, alto impatto):
- Estrarre un `SharedAutomationCanvas` usato sia da Marketing che da Operative
- Estrarre `SharedAutomationNode` e `SharedConnectionLine`
- Zero modifiche DB, zero modifiche logica

**Fase 2 — Assorbire Task in Regole** (medio rischio):
- Migrare le `task_automation_rules` esistenti in `automation_rules` con `categoria = "task"`
- Reindirizzare il tab Task alle Regole filtrate per categoria task
- Eliminare `TaskAutomationsPage` e le 2 tabelle

**Fase 3 — Valutare se unificare i due engine** (alto rischio, da valutare):
- Il Marketing engine opera su `marketing_contacts` (CRM esterno)
- L'Operative engine opera su `orders`, `tickets`, `tasks` (gestionale interno)
- Hanno domini completamente diversi — l'unificazione potrebbe non avere senso

Vuoi che proceda con la **Fase 1** (canvas condiviso) o con un'altra fase?

