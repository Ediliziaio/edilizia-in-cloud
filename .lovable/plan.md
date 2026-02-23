
# Audit Enterprise Automazioni - Report AS-IS e Piano Interventi

## Stato Attuale (AS-IS)

### Gia' Implementato (Confermato Funzionante)
- Builder visuale full-screen con canvas a griglia, nodi draggabili, connessioni SVG
- 5 categorie trigger (Contatto, Opportunita', Appuntamento, Comunicazioni, Sistema) con 19 trigger totali
- 4 categorie azioni (Comunicazione, CRM, Logica, Integrazione) con 22 azioni totali
- Condition Builder avanzato con AND/OR annidati, negazione (NOT), gruppi ricorsivi, custom fields dal DB
- Validazione completa: trigger filters, action config (22 validatori), publish guard
- Undo/Redo con history (useRef ottimizzato), Autosave con debounce 2s
- Pannello configurazione 420px per ogni tipo di nodo
- Dashboard con tabella, paginazione, ricerca, bulk delete, cartelle
- Tab Impostazioni (Contatto, Comunicazione, Conversazioni), Iscrizioni, Log
- Impostazioni globali workflow (Promemoria, Autosave, Sospensione programmata)
- Multi-tenancy con company_id + effectiveCompany ovunque
- Input validation (trim + maxLength 100) su nomi flow e cartelle
- Lazy loading su tutte le route, indici DB ottimizzati
- ErrorBoundary, gestione errori coerente

### Problemi Identificati (con Priorita')

#### P0 - Sidebar Automazioni: link diretti mancanti
La sidebar ha solo un link "Automazioni" generico. Per allinearsi a GHL, servono accessi diretti a stati specifici.

**Intervento**: Aggiungere nella sidebar i sotto-link per accesso rapido:
- "Attive" -> `/azienda/marketing/automazioni?filter=published`
- "Bozze" -> `/azienda/marketing/automazioni?filter=draft`

File: `src/lib/sidebarConfig.ts`
- Mantenere la voce "Automazioni" come link principale
- NON aggiungere sotto-voci nella sidebar (sovraccarico visivo) - invece, utilizzare i query params per pre-filtrare la lista

File: `src/pages/azienda/marketing/MarketingAutomations.tsx`
- Leggere `searchParams.get("filter")` e pre-impostare `listFilter` di conseguenza
- Quando si naviga con `?filter=published`, il tab "Tutti i flussi" mostrera' solo i pubblicati
- Quando si naviga con `?filter=draft`, mostrera' "Necessita revisione"

#### P1 - AutomationSettingsTab: stato locale non persistito
Le impostazioni nella tab "Impostazioni" (reinserimento, stop on reply, time window, mark as read) usano `useState` locale e non vengono salvate nel database.

**Intervento**:
File: `src/components/marketing/automations/AutomationSettingsTab.tsx`
- Accettare `flow` e `onUpdate` come props
- Leggere i valori iniziali da `flow.config_json?.settings` (o default)
- Al cambio di ogni switch, chiamare `onUpdate` per salvare in `config_json.settings`
- Aggiungere un bottone "Salva impostazioni" in fondo

File: `src/components/marketing/automations/AutomationBuilder.tsx`
- Passare `flow` e `updateFlowMutation` alla tab settings

#### P1 - GlobalWorkflowSettings: stato locale non persistito
Come sopra, le impostazioni globali (promemoria, autosave, sospensione) usano stato locale.

**Intervento**:
File: `src/components/marketing/automations/GlobalWorkflowSettings.tsx`
- Creare una tabella `automation_global_settings` (company_id PK, config_json JSONB)
- Caricare le impostazioni dal DB con useQuery
- Salvare con useMutation su upsert

Migrazione SQL:
```sql
CREATE TABLE IF NOT EXISTS automation_global_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  config_json jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE automation_global_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company can manage own settings"
  ON automation_global_settings FOR ALL
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
```

#### P1 - EnrollmentsTab e LogsTab: verificare contenuto
Verificare che le tab Iscrizioni e Log mostrino dati reali dal database.

File: `src/components/marketing/automations/AutomationEnrollmentsTab.tsx`
File: `src/components/marketing/automations/AutomationLogsTab.tsx`
- Se sono placeholder, popolarli con query reali sulle tabelle `automation_enrollments` e `automation_execution_log`

#### P2 - Pulizia: import Settings2 non usato altrove
File: `src/pages/azienda/marketing/MarketingAutomations.tsx`
- `Settings2` e' usato correttamente nella tab. Nessun intervento.

#### P2 - Sidebar: separazione visiva Marketing
La sidebar gia' separa correttamente "Gestione Interna" da "Marketing" con due array distinti (`internalNavItems` e `marketingNavItems`). Confermato OK.

### Checklist Architettura Automation Builder

| Area | Stato | Note |
|------|-------|------|
| Canvas visuale con griglia | OK | Pan, zoom, drag nodi |
| Nodo Trigger obbligatorio | OK | Guard su publish |
| Blocchi drag & drop | OK | Con connessioni automatiche |
| Connessioni SVG | OK | AutomationConnectionLine |
| Autosave | OK | Debounce 2s |
| Versioning | OK | version++ su publish |
| Pannello configurazione | OK | 420px, tutti i 22 tipi |
| Eliminazione nodi | OK | Con cleanup connessioni |
| Duplicazione nodi | OK | Deep clone con nuovo ID |
| Validazione pre-publish | OK | Trigger + almeno 1 azione |
| Undo/Redo | OK | History con useRef |
| Keyboard shortcuts | OK | Ctrl+Z, Ctrl+S, Delete |

### Checklist Condition Builder

| Area | Stato | Note |
|------|-------|------|
| Condizioni singole | OK | Field + Operator + Value |
| Gruppi di condizioni | OK | Ricorsivi |
| AND / OR | OK | Toggle visivo |
| Annidamento | OK | Sotto-gruppi illimitati |
| Negazione (NOT) | OK | Per condizione singola |
| Custom fields dal DB | OK | Caricati dinamicamente |
| Operatori tipizzati | OK | text/number/date/boolean/tag/user/select |
| Validazione | OK | Campo/operatore/valore obbligatori |
| DatePicker per date | OK | ConditionValueInput |
| Multi-select per tag | OK | TagSelector integrato |
| UserSelect | OK | Con join profiles+user_roles |

### Checklist Sicurezza e Multi-Tenancy

| Area | Stato |
|------|-------|
| company_id su tutte le tabelle automazione | OK |
| RLS su automation_flows, nodes, connections, enrollments, execution_log, folders | OK |
| effectiveCompany usato ovunque | OK |
| persistCompanyId fallback per super admin | OK |
| Input validation nomi (trim + maxLength) | OK |
| Validazione config azioni (validateActionConfig) | OK |
| No API keys esposte | OK |
| Auth token con refresh automatico | OK |

### Checklist Performance

| Area | Stato |
|------|-------|
| Lazy loading route | OK |
| useRef per history (no callback recreation) | OK |
| useRef per pan/zoom/nodes nel canvas | OK |
| Indici DB su company_id + status/folder | OK |
| Memo su AutomationNodeComponent | OK |
| Debounce autosave | OK |

## Piano Interventi

### Intervento 1 - Persistenza AutomationSettingsTab (P1)
File: `src/components/marketing/automations/AutomationSettingsTab.tsx`
- Aggiungere props `flowId`, `initialSettings`, `onSave`
- Caricare valori da `initialSettings` al mount
- Bottone "Salva" che chiama `onSave(settings)`

File: `src/components/marketing/automations/AutomationBuilder.tsx`
- Passare settings dal flow e callback di salvataggio alla tab

### Intervento 2 - Persistenza GlobalWorkflowSettings (P1)
Migrazione SQL: creare tabella `automation_global_settings`
File: `src/components/marketing/automations/GlobalWorkflowSettings.tsx`
- useQuery per caricare, useMutation per upsert
- Toast di successo/errore

### Intervento 3 - Pre-filtro dalla URL (P0)
File: `src/pages/azienda/marketing/MarketingAutomations.tsx`
- Leggere `useSearchParams` per `?filter=published|draft`
- Pre-impostare `listFilter` corrispondente

### Intervento 4 - Verifica tab Iscrizioni e Log
Leggere i file e verificare se mostrano dati reali. Se placeholder, popolarli.

## File Modificati (Previsti)
1. `src/components/marketing/automations/AutomationSettingsTab.tsx` - persistenza settings
2. `src/components/marketing/automations/AutomationBuilder.tsx` - passaggio props settings
3. `src/components/marketing/automations/GlobalWorkflowSettings.tsx` - persistenza DB
4. `src/pages/azienda/marketing/MarketingAutomations.tsx` - pre-filtro URL
5. Migrazione SQL - tabella automation_global_settings

## Dichiarazione

Il modulo Automazioni e' gia' a livello GHL per completezza funzionale del builder, trigger, condition builder e configurazione azioni. Gli interventi proposti riguardano esclusivamente la persistenza di impostazioni attualmente non salvate e miglioramenti di navigazione. Nessun comportamento funzionale viene modificato.
