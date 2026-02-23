

# Audit Enterprise - Risultato e Interventi Rimanenti

## Stato Attuale (AS-IS)

Il progetto e' gia' in ottimo stato dopo i refactor precedenti:
- Lazy loading implementato su tutte le route (~60 componenti)
- Hook `useAutomationBuilder` ottimizzato con `useRef` per la storia
- Indici database creati su tabelle critiche
- Input validation con trim + maxLength sui nomi flow/cartelle
- ErrorBoundary su tutte le aree principali
- RLS su tutte le tabelle con `security definer` functions
- Multi-tenancy con `company_id` isolato ovunque
- Audit trail tramite `company_activity_log` con trigger automatici

## Problemi Residui Identificati (P0/P1)

### P0 - Console Warning: ref su function component
**Problema**: Due warning in console da `AutomationCanvas` e `AutomationBuilder`:
- `Tooltip` wrappa un function component senza `forwardRef` in `AutomationCanvas`
- `AlertDialog` riceve ref su function component in `AutomationBuilder`

**Fix**:
- File: `src/components/marketing/automations/AutomationCanvas.tsx` -- I `TooltipTrigger` che wrappano `<Button>` vanno verificati; il problema e' probabilmente un `TooltipTrigger` che wrappa direttamente un componente custom senza `asChild`. Servira' aggiungere `asChild` o wrappare in `<span>`.
- File: `src/components/marketing/automations/AutomationBuilder.tsx` -- L'`AlertDialog` a riga 487 e' gia' usato correttamente con `AlertDialogContent`, ma il warning potrebbe venire dal Fragment `<>` che wrappa il dialog. Fix: wrappare in un `<div>` o usare un componente con ref.

### P1 - Status badge in inglese
**Problema**: I badge di stato nella lista automazioni sono in inglese ("Draft", "Published", "Archived") invece che italiano.
File: `src/components/marketing/automations/AutomationFlowsList.tsx` (righe 260-264)
**Fix**: Tradurre in "Bozza", "Pubblicata", "Archiviata".

### P1 - Drag node causa re-render continui
**Problema**: In `AutomationCanvas`, `handleNodeDragStart` dipende da `nodes` (riga 76), causando ricreazione del callback ad ogni modifica dello state nodes.
**Fix**: Usare `useRef` per accedere ai nodi correnti durante il drag, evitando la dipendenza diretta.

### P1 - Pan callback dipende da `pan` state
**Problema**: `handleCanvasMouseDown` dipende da `pan` (riga 41), ricreandosi ad ogni spostamento del canvas.
**Fix**: Usare un ref per il pan corrente nella callback, eliminando la dipendenza.

### P1 - Leaked Password Protection
**Problema**: Il linter di sicurezza segnala "Leaked Password Protection Disabled". Questa e' una configurazione a livello di progetto nel pannello Supabase Auth, non configurabile via codice.
**Nota**: Richiedera' intervento manuale nel pannello di configurazione Cloud.

## Interventi Proposti

### 1. Fix console warnings (P0)
File: `src/components/marketing/automations/AutomationCanvas.tsx`
- Aggiungere `asChild` ai `TooltipTrigger` che non lo hanno, oppure wrappare i children in `<span>`

File: `src/components/marketing/automations/AutomationBuilder.tsx`
- Assicurarsi che tutti gli `AlertDialog` non ricevano ref inaspettati -- verificare che il `<>` Fragment sia compatibile

### 2. Tradurre badge di stato (P1)
File: `src/components/marketing/automations/AutomationFlowsList.tsx`
- Cambiare "Draft" in "Bozza", "Published" in "Pubblicata", "Archived" in "Archiviata"

### 3. Ottimizzazione callback Canvas (P1)
File: `src/components/marketing/automations/AutomationCanvas.tsx`
- Sostituire la dipendenza `nodes` in `handleNodeDragStart` con un `nodesRef` (useRef)
- Sostituire la dipendenza `pan` in `handleCanvasMouseDown` con un `panRef` (useRef)
- Questo elimina ricreazioni di callback durante drag e pan, migliorando la fluidita'

### 4. Sicurezza: Leaked Password Protection
- Segnalare all'utente che questa impostazione va attivata manualmente nel pannello di configurazione Cloud sotto Authentication > Settings

## Checklist Multi-Tenant Isolation
- [x] `company_id` su tutte le entita' principali
- [x] RLS policies con `security definer` functions
- [x] `effectiveCompany` usato ovunque (supporta impersonificazione)
- [x] Query filtrate per `company_id` in tutti i componenti verificati
- [x] Edge functions con autenticazione e validazione
- [x] Nessun dato cross-tenant accessibile

## Checklist Sicurezza
- [x] Ruoli in tabella separata (`user_roles`) con enum `app_role`
- [x] `has_role()` e `has_permission()` come `security definer`
- [x] Input validation su nomi flow e cartelle (trim + maxLength 100)
- [x] No API keys esposte nel client (solo anon key, che e' pubblica by design)
- [x] Auth token gestito da Supabase SDK con refresh automatico
- [x] CORS configurato nelle edge functions
- [ ] Leaked Password Protection -- richiede attivazione manuale

## Checklist Backup
- [x] Backup giornalieri automatici (gestiti da Lovable Cloud)
- [x] Point-in-time recovery disponibile
- [x] Audit trail attivo (`company_activity_log`)

## File modificati
1. `src/components/marketing/automations/AutomationCanvas.tsx` -- fix ref warning + ottimizzazione callback
2. `src/components/marketing/automations/AutomationBuilder.tsx` -- fix AlertDialog ref warning
3. `src/components/marketing/automations/AutomationFlowsList.tsx` -- traduzione badge stato

