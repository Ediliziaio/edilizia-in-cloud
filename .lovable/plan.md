

# Verifica Completa - Builder Automazioni Marketing

Dopo analisi approfondita di tutti i file (Builder, Canvas, Settings, Enrollments, Logs, NodeConfig, Node, ConnectionLine, TriggerConditionBuilder, GlobalWorkflowSettings, types), ecco il verdetto:

---

## Funzionalita che funzionano correttamente

- **Builder tab**: Canvas con pan/zoom/drag, creazione nodi, connessioni SVG, branching condition/split
- **Salvataggio**: Auto-save con debounce 2s, save manuale Ctrl+S, upsert nodi e connessioni
- **Undo/Redo**: History basata su ref, push solo su mouseUp
- **Tab Impostazioni (Settings)**: Lettura/scrittura `config_json.settings` con type safety
- **Tab Cronologia (Enrollments)**: Query con filtri data, stato, ricerca entity_id
- **Tab Registro (Logs)**: Query con filtri data, attivita, stato, ricerca node_id
- **Trigger config**: Selezione categoria/evento, filtri AND/OR nested, campi personalizzati da DB, negazione NOT
- **Action config**: 22 tipi con form dedicati, validazione, select dinamiche (pipeline, stages, utenti, templates)
- **GlobalWorkflowSettings**: Carica utenti reali, salva promemoria e sospensioni
- **Pubblicazione**: Toggle con validazione pre-publish
- **Eliminazione/Archiviazione**: Funzionali con conferma dialog

---

## Problemi residui trovati

### 1. `updateFlowMutation` non include `config_json` nel tipo Supabase generato per update
Il tipo generato in `types.ts` per `automation_flows.Update` include `config_json` come `Json | null`, ma `updateFlowMutation` in `useAutomationBuilder.ts` usa `Partial<AutomationFlow>` come input. La chiamata `supabase.from("automation_flows").update(safeUpdates)` passa `config_json` come `Record<string, any>` che e compatibile con `Json`. Questo funziona ma il tipo `safeUpdates` non e strettamente tipizzato. **Basso impatto** - funziona a runtime.

### 2. Tab "Settings" non visibile nella navigazione corrente
In `AutomationBuilder.tsx` riga 311-316, i tab sono: `builder`, `settings`, `enrollments`, `logs`. Ma la tab "settings" mostra `AutomationSettingsTab` (impostazioni del flusso singolo), NON `GlobalWorkflowSettings`. Le impostazioni globali del workflow sono accessibili solo dalla lista automazioni. Questo e corretto dal punto di vista UX ma potrebbe confondere. **Non un bug**.

### 3. La `Calendar` del date picker usa `onSelect` che restituisce `Date | undefined`
In `AutomationEnrollmentsTab.tsx` e `AutomationLogsTab.tsx`, il calendario usa `onSelect={(d) => { setStartDate(d); setPage(0); }}` dove `d` e `Date | undefined`. TypeScript dovrebbe segnalare che `setStartDate` accetta `Date | undefined` ma non `Date | null`. Verificando il tipo: `useState<Date>()` produce `Date | undefined`, quindi e corretto.

### 4. Nodi duplicati non aggiornano `company_id`
In `handleDuplicate` (riga 215-227), il nodo duplicato copia il `company_id` dal nodo originale (`...node`). Questo e corretto se l'originale ha il company_id giusto, ma nodi creati prima del fix (con `company_id: ""`) produrranno duplicati con `company_id: ""`.

**Fix**: Sovrascrivere `company_id` nel duplicato con `effectiveCompany?.id || node.company_id`.

### 5. Nodo "Salva" nel pannello default (delay/condition/split/goal) non persiste
Nel pannello config per nodi non-action (riga 838-849), il pulsante "Salva" chiama solo `onClose()` (dopo validazione per condition). Non chiama esplicitamente `saveAll()`. Il salvataggio avviene solo tramite auto-save. Se l'utente cambia tab o naviga via prima dei 2 secondi di debounce, le modifiche possono perdersi.

**Fix**: Aggiungere un `triggerAutoSave` o `saveAll` nel gestore "Salva" del pannello config.

### 6. Stessa cosa per il pulsante "Salva il trigger" (riga 218)
Dopo `handleSaveTrigger`, viene chiamato `onClose()`. Il salvataggio dipende dall'auto-save. Se l'utente chiude il builder subito dopo, i dati non sono persistiti.

**Fix**: Forzare un salvataggio immediato quando si preme "Salva" nel pannello config.

---

## Piano di Fix

| # | File | Modifica |
|---|------|----------|
| 1 | `AutomationBuilder.tsx` | In `handleDuplicate`, sovrascrivere `company_id` con `effectiveCompany?.id` |
| 2 | `AutomationBuilder.tsx` | Passare `saveAll` come prop o callback al pannello config, oppure chiamare `saveAll()` dopo che il pannello config chiude |
| 3 | `AutomationNodeConfig.tsx` | Nei pulsanti "Salva il trigger" e "Salva azione", chiamare una callback `onSaveImmediate` oltre a `onClose` |
| 4 | `useAutomationBuilder.ts` | Esporre una funzione `saveImmediate` che salva senza debounce |

Questi 4 fix garantiscono che il salvataggio sia affidabile e che i dati duplicati mantengano la company corretta.

