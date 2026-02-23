
# Automazioni Marketing - Piano Interventi Rimanenti

## Stato Attuale (Confermato Funzionante)

Il modulo e' gia' a livello GHL per quanto riguarda il frontend:

- Builder visuale full-screen con canvas, pan, zoom, drag nodi, connessioni SVG
- 5 categorie trigger (19 trigger totali), 4 categorie azioni (22 azioni totali)
- Condition Builder ricorsivo con AND/OR annidati, negazione NOT, gruppi, custom fields dal DB
- 22 validatori action config, validazione pre-publish, undo/redo con useRef
- Autosave debounce 2s, versioning su publish
- Dashboard con tabella, paginazione, ricerca, bulk delete, cartelle, deep linking URL
- Tab Impostazioni persistite in DB (config_json su automation_flows)
- Global Workflow Settings persistite in DB (automation_global_settings)
- Multi-tenancy con company_id + effectiveCompany ovunque
- Input validation, indici DB, lazy loading route, ErrorBoundary

## Problemi Identificati

### P0 - Tab "Cronologia Iscrizioni" e' un placeholder
Il file `AutomationEnrollmentsTab.tsx` non esegue **nessuna query** al database. Mostra solo una tabella vuota statica con filtri non funzionanti. Deve popolarsi dalla tabella `automation_enrollments`.

### P0 - Tab "Registro di Esecuzione" e' un placeholder
Il file `AutomationLogsTab.tsx` non esegue **nessuna query** al database. Mostra solo una tabella vuota statica. Deve popolarsi dalla tabella `automation_execution_log`.

### P1 - Manca `flowId` nelle tab Enrollments e Logs
Entrambe le tab non ricevono il `flowId` come prop dal `AutomationBuilder.tsx` (riga 494-495). Senza questo parametro non possono filtrare i dati per flusso.

---

## Piano Interventi

### Intervento 1 - Popolare AutomationEnrollmentsTab con dati reali

File: `src/components/marketing/automations/AutomationEnrollmentsTab.tsx`

Modifiche:
- Aggiungere prop `flowId: string`
- Implementare `useQuery` per caricare da `automation_enrollments` filtrato per `flow_id`
- Join con `marketing_contacts` per mostrare nome/email contatto
- Rendere funzionanti i filtri esistenti (date range, stato, ricerca contatto)
- Aggiungere paginazione
- Mostrare dati reali nelle colonne: Contatto, Ragione iscrizione, Data, Azione attuale, Stato, Prossima esecuzione

### Intervento 2 - Popolare AutomationLogsTab con dati reali

File: `src/components/marketing/automations/AutomationLogsTab.tsx`

Modifiche:
- Aggiungere prop `flowId: string`
- Implementare `useQuery` per caricare da `automation_execution_log` filtrato per `flow_id`
- Join con `marketing_contacts` per mostrare nome contatto
- Rendere funzionanti i filtri (date range, tipo attivita', stato, ricerca contatto)
- Aggiungere paginazione
- Mostrare dati reali: Contatto, Azione eseguita, Stato (success/failed/pending), Timestamp

### Intervento 3 - Passare flowId alle tab

File: `src/components/marketing/automations/AutomationBuilder.tsx`

Modifiche (righe 494-495):
- Cambiare `<AutomationEnrollmentsTab />` in `<AutomationEnrollmentsTab flowId={flowId!} />`
- Cambiare `<AutomationLogsTab />` in `<AutomationLogsTab flowId={flowId!} />`

---

## Checklist Completa

| Area | Stato |
|------|-------|
| Canvas visuale con griglia, pan, zoom | OK |
| Nodo Trigger obbligatorio | OK |
| Drag & drop con connessioni SVG | OK |
| Autosave debounce 2s | OK |
| Versioning su publish | OK |
| Pannello configurazione 420px | OK |
| 22 tipi azione con validazione | OK |
| 19 trigger con filtri | OK |
| Condition Builder AND/OR/NOT annidato | OK |
| Custom fields dal DB | OK |
| Undo/Redo con useRef | OK |
| Keyboard shortcuts | OK |
| Dashboard tabella + paginazione | OK |
| Bulk delete con conferma | OK |
| Cartelle e navigazione | OK |
| Deep linking URL (?filter=) | OK |
| Settings persistite in DB | OK |
| Global settings persistite in DB | OK |
| Multi-tenancy isolata | OK |
| Input validation (trim + maxLength) | OK |
| Indici DB ottimizzati | OK |
| Lazy loading route | OK |
| RLS su tutte le tabelle | OK |
| Tab Iscrizioni con dati reali | DA FARE |
| Tab Log con dati reali | DA FARE |

## File Modificati (Previsti)

1. `src/components/marketing/automations/AutomationEnrollmentsTab.tsx` - query reali + filtri funzionanti
2. `src/components/marketing/automations/AutomationLogsTab.tsx` - query reali + filtri funzionanti
3. `src/components/marketing/automations/AutomationBuilder.tsx` - passaggio flowId alle tab

## Note Architetturali

Il backend event-driven (Event Store, Trigger Matcher, Runner asincrono, State Machine) richiede un'implementazione separata tramite Edge Functions + pg_cron e va pianificato come progetto dedicato. Le tabelle DB necessarie (`automation_enrollments`, `automation_execution_log`) esistono gia' e sono pronte per ricevere dati dal motore di esecuzione.

Gli interventi proposti riguardano esclusivamente il collegamento delle tab UI ai dati esistenti nel database, senza modificare alcun comportamento funzionale del builder.
