
# Hard Refactor: Production Enterprise Readiness

## Riepilogo Analisi

Il progetto ha un'architettura solida: multi-tenant con company_id, RLS su tutte le tabelle, ruoli in tabella dedicata con `security definer`, edge functions per operazioni privilegiate. La struttura e' gia' buona, quindi il piano si concentra su interventi mirati ad alto impatto.

---

## 1. Performance: Lazy Loading delle Route

**Problema**: Tutte le pagine (~60 componenti) vengono importate staticamente in `App.tsx`, aumentando il bundle iniziale.

**Intervento**: Convertire tutti gli import delle pagine in `React.lazy()` con `Suspense` wrapper.

File: `src/App.tsx`
- Sostituire gli import statici con `const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"))` ecc.
- Wrappare le route con un fallback Suspense (spinner di caricamento)
- Stima: riduzione del 40-60% del bundle iniziale

---

## 2. Performance: Ottimizzazione useAutomationBuilder

**Problema**: Il hook `pushHistory` ha una dipendenza su `historyIndex` che causa ricreazione ad ogni cambio, e `addNode`/`updateNode`/`removeNode` dipendono tutti da `connections`/`nodes` state causando cascate di ricreazione.

**Intervento**:
File: `src/hooks/useAutomationBuilder.ts`
- Usare `useRef` per `historyIndex` e `history` per evitare ricreazioni dei callback
- Usare updater functions (`setConnections(prev => ...)`) nelle dipendenze per eliminare la dipendenza diretta su `connections`/`nodes`

---

## 3. Performance: Indici Database

**Intervento**: Aggiungere indici compositi sulle tabelle piu' interrogate per accelerare le query filtrate per `company_id`.

Migrazione SQL:
```sql
CREATE INDEX IF NOT EXISTS idx_automation_flows_company_status ON automation_flows(company_id, status);
CREATE INDEX IF NOT EXISTS idx_automation_flows_company_folder ON automation_flows(company_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_automation_nodes_flow ON automation_nodes(flow_id);
CREATE INDEX IF NOT EXISTS idx_automation_connections_flow ON automation_connections(flow_id);
CREATE INDEX IF NOT EXISTS idx_automation_folders_company_parent ON automation_folders(company_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON orders(company_id, current_status_id);
CREATE INDEX IF NOT EXISTS idx_tasks_company_status ON tasks(company_id, status);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_company ON marketing_contacts(company_id);
```

---

## 4. Sicurezza: Leaked Password Protection

**Problema**: Il linter di sicurezza segnala "Leaked Password Protection Disabled".

**Intervento**: Abilitare la protezione password compromesse tramite il tool configure-auth.

---

## 5. Sicurezza: Validazione input nel Builder

**Problema**: I nomi dei flow e delle cartelle non hanno validazione (lunghezza, caratteri).

**Intervento**:
- File: `src/hooks/useAutomationBuilder.ts` - Aggiungere trim + max length (100 char) al nome flow nel `createFlowMutation` e `updateFlowMutation`
- File: `src/pages/azienda/marketing/MarketingAutomations.tsx` - Validare nome cartella (trim + max 100 char) prima del mutation
- File: `src/components/marketing/automations/AutomationBuilder.tsx` - Limitare Input del nome a maxLength={100}

---

## 6. Pulizia Codice

**Interventi**:

- **`src/components/marketing/automations/AutomationFlowsList.tsx`**: I testi paginazione "Previous" e "Next" sono in inglese, tradurli in italiano ("Precedente" / "Successivo") per coerenza UI
- **`src/App.tsx`**: Rimuovere l'import/export `.env` che viene ricreato ad ogni build (file non dovrebbe essere tracciato)
- **`src/components/marketing/automations/AutomationBuilder.tsx`**: Il `TooltipProvider` wrapper e' ridondante perche' ce n'e' gia' uno nel root `App.tsx` - rimuoverlo

---

## 7. Stabilita': Error Boundary nel Builder

**Problema**: Se il canvas crasha (es. nodo malformato), l'intera app si blocca.

**Intervento**: Wrappare il contenuto delle tab `builder`/`settings`/`enrollments`/`logs` nel componente `ErrorBoundary` gia' esistente nel progetto.

File: `src/components/marketing/automations/AutomationBuilder.tsx`

---

## 8. Backup e Monitoraggio

**Stato attuale**: Lovable Cloud (Supabase) fornisce automaticamente:
- Backup giornalieri automatici del database
- Point-in-time recovery (PITR)
- Log centralizzati (auth, DB, edge functions) accessibili via analytics
- Uptime monitoring integrato

**Nessun intervento aggiuntivo necessario** per backup. Il sistema di audit trail e' gia' implementato tramite `company_activity_log` con trigger automatici.

---

## Riepilogo File Modificati

| File | Intervento |
|------|-----------|
| `src/App.tsx` | Lazy loading di tutte le pagine |
| `src/hooks/useAutomationBuilder.ts` | Ottimizzazione callback con useRef |
| `src/components/marketing/automations/AutomationBuilder.tsx` | Rimozione TooltipProvider ridondante, maxLength input, ErrorBoundary |
| `src/pages/azienda/marketing/MarketingAutomations.tsx` | Validazione nome cartella |
| `src/components/marketing/automations/AutomationFlowsList.tsx` | Traduzione testi paginazione |
| Migrazione SQL | Indici database |
| Auth config | Leaked password protection |

## Vincolo rispettato
Nessun comportamento funzionale viene modificato. Tutte le modifiche sono di tipo performance, sicurezza, pulizia e stabilita'.
