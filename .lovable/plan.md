

## FLOW-EXT-04 — Audit Bug e Criticità: Piano di Correzione

### Riepilogo problemi trovati

Dopo aver analizzato il database, il catalogo, l'edge function `process-automation`, i template e la UI, ecco i problemi reali identificati, ordinati per gravità.

---

### PROBLEMA 1 — Mismatch naming azioni tra catalogo UI e edge function (CRITICO)

Il catalogo `flow-node-catalog.ts` (FLOW-EXT-02) definisce le azioni con ID come `crea_task`, `invia_email`, `aggiungi_tag`, `crea_opportunita`, etc. Ma l'edge function `process-automation/index.ts` usa ID diversi per le stesse azioni:

```text
CATALOGO UI              →  EDGE FUNCTION
──────────────────────────────────────────
crea_task                →  create_task
invia_email              →  send_email
invia_whatsapp           →  send_whatsapp
invia_sms                →  send_sms
invia_notifica_inapp     →  send_notification
aggiungi_tag             →  add_tag
rimuovi_tag              →  remove_tag
crea_opportunita         →  create_opportunity
sposta_opportunita       →  move_opportunity
assegna_agente           →  assign_user
aggiorna_campo           →  update_field
chiama_webhook           →  webhook_out
esegui_agente_ai         →  send_ai_message / call_with_ai_agent
attendi                  →  (delay node, non action)
crea_bozza_ordine        →  ❌ MANCANTE
crea_bozza_preventivo    →  ❌ MANCANTE
crea_cantiere            →  ❌ MANCANTE
crea_appuntamento        →  ❌ MANCANTE
crea_ticket              →  ❌ MANCANTE
crea_fattura             →  ❌ MANCANTE
```

**Inoltre**, i config field names sono diversi. Catalogo usa `titolo`, `priorita`, `destinatario`, ma l'edge function usa `task_title`, `task_priority`, `email_to`.

**Fix**: Aggiornare l'edge function `process-automation` per supportare ENTRAMBI i set di ID (vecchi + nuovi) con alias, e aggiungere handler per le 6 azioni mancanti.

---

### PROBLEMA 2 — dbTable errati nel catalogo (CRITICO)

Tabelle referenziate dal catalogo che **non esistono** nel database:

```text
CATALOGO dbTable          →  TABELLA REALE
──────────────────────────────────────────
fatture_native            →  ❌ non esiste (esiste: invoices)
preventivi_native         →  ❌ non esiste (esiste: quotes)
support_tickets           →  ❌ non esiste (esiste: tickets)
cantieri                  →  ❌ non esiste (nessuna tabella cantieri)
```

Tabelle che esistono e sono referenziate correttamente:
- `marketing_contacts` ✅
- `marketing_opportunities` ✅  
- `appointments` ✅
- `orders` ✅
- `tasks` ✅
- `employees` ✅

**Fix**: Aggiornare i `dbTable` nel catalogo per allinearli ai nomi reali.

---

### PROBLEMA 3 — Variabili template con naming sbagliato (MEDIO)

Nei template `flow-templates.ts`, T01 usa `{{lead.nome}}`, `{{lead.telefono}}`, `{{campagna.nome}}` — ma il catalogo definisce le variabili come `{{contatto.nome}}`, `{{contatto.telefono}}`. L'edge function non risolve queste variabili perché il context viene popolato con chiavi diverse.

**Fix**: Aggiornare i template per usare il naming del catalogo (`contatto.*` invece di `lead.*`).

---

### PROBLEMA 4 — Config field names mismatch nei template (MEDIO)

I template usano `action_type` nel configJson dei nodi, ma l'edge function cerca `action_type` nello switch. Tuttavia i nomi dei config fields sono diversi:

Template: `{ action_type: 'crea_task', titolo: '...' }`
Edge function cerca: `{ action_type: 'create_task', task_title: '...' }`

**Fix**: Allineare i config field names tra template, catalogo e edge function.

---

### PROBLEMA 5 — Commento stale in companyRoutes.tsx (BASSO)

Riga 192: `{/* Unified Automazioni page (3 tabs: operative, task, marketing) */}` — da aggiornare.

---

### PROBLEMA 6 — Webhook esterno senza SSRF protection (MEDIO)

L'azione `webhook_out` nell'edge function fa `fetch(url)` senza validazione dell'URL. Permette chiamate a `localhost`, `169.254.169.254` (AWS metadata), etc.

**Fix**: Aggiungere validazione URL.

---

### PROBLEMA 7 — Nessuna idempotenza nell'edge function (BASSO)

Se un webhook viene inviato due volte, crea due enrollment. Nessun meccanismo di deduplicazione.

---

### Piano di implementazione (in ordine di priorità)

#### Task 1 — Fix dbTable nel catalogo
In `flow-node-catalog.ts`:
- `fatture_native` → `invoices`
- `preventivi_native` → `quotes`  
- `support_tickets` → `tickets`
- `cantieri` → rimuovere (tabella non esiste nel DB)

#### Task 2 — Aggiungere alias azioni nell'edge function
In `process-automation/index.ts`, nella funzione `executeAction`:
- Aggiungere mapping aliases: `crea_task` → esegui lo stesso handler di `create_task`
- Aggiungere mapping config fields: `titolo` → `task_title`, `priorita` → `task_priority`, etc.
- Aggiungere i 6 handler mancanti: `crea_bozza_ordine`, `crea_bozza_preventivo`, `crea_cantiere`, `crea_appuntamento`, `crea_ticket`, `crea_fattura`

#### Task 3 — Fix variabili nei template
In `flow-templates.ts`:
- `{{lead.nome}}` → `{{contatto.nome}}`
- `{{lead.telefono}}` → `{{contatto.telefono}}`
- `{{campagna.nome}}` → resta (è una variabile di contesto, va bene)
- Allineare i config fields dei nodi action ai nomi attesi dall'edge function

#### Task 4 — SSRF protection su webhook_out
In `process-automation/index.ts`, case `webhook_out`:
- Validare URL contro lista di host bloccati (localhost, 127.0.0.1, 169.254.*, 10.*, 172.16.*, 192.168.*)

#### Task 5 — Aggiornare commento stale
In `companyRoutes.tsx`, aggiornare il commento alla riga 192.

---

### Cosa NON serve fare

- **RLS**: `automation_flows`, `automation_nodes`, `automation_connections` hanno già RLS abilitato con policy per company admin, staff e super admin ✅
- **`flow_execution_runs`** ha già RLS con policy "Users can view own company execution runs" ✅
- **Tab Operative**: già rimossa dalla UI (solo un commento stale rimane) ✅
- **Schema DB**: Non esiste una tabella `flows` separata e non serve crearne una. Il sistema usa `automation_flows` + tabelle normalizzate ✅
- **Indici**: da valutare post-go-live in base all'uso reale

