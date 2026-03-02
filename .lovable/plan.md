

# Piano: Potenziamento Sezione Aziende — Sales & Growth Intelligence

## Obiettivo
Trasformare la sezione Aziende da semplice anagrafica a strumento operativo per Sales, CSM e Growth, aggiungendo visibilita sul comportamento tenant, scoring, azioni rapide e pipeline visuale.

## Interventi proposti (ordinati per impatto)

### 1. Health Score + Last Login nella lista aziende
Aggiungere due colonne alla tabella `CompaniesList`:
- **Health Score** (badge colorato: Healthy/At Risk/Critical) calcolato da: giorni dall'ultimo ordine, completamento onboarding, stato pagamento
- **Ultimo Accesso** dal campo `last_sign_in_at` dei profili utente admin dell'azienda

Richiede: query aggiuntiva su `profiles` per `last_sign_in_at`, mapping health score gia disponibile in `useAdminRevenueData`.

### 2. Activity Feed nel dettaglio azienda
Nuovo tab "Attivita" in `CompanyDetail` che mostra una timeline cronologica aggregando:
- `admin_audit_log` (azioni admin)
- `subscription_logs` (eventi abbonamento)
- `orders` (ultimi ordini creati)
- `tickets` (ticket aperti)
- `lifecycle_notifications` (alert ricevuti)

Componente: `CompanyActivityTab.tsx` con filtri per tipo evento e scroll infinito.

### 3. Conversion Card per aziende in Trial
Card prominente nel tab Panoramica (solo per status=trial) che mostra:
- Giorni rimasti del trial
- % completamento onboarding (riutilizzando `useOnboardingProgress`)
- Metodo pagamento configurato? Si/No
- CTA: "Invia reminder" / "Estendi trial" / "Proponi upgrade"

### 4. Note CRM con timestamp
Nuovo componente `CompanyNotes` nel dettaglio:
- Lista note con autore, data, testo
- Aggiunta rapida nota (input + bottone)
- Tabella DB: `company_notes` (id, company_id, author_id, content, created_at)
- Visibile nel tab Panoramica o come nuovo tab "Note"

### 5. Next Best Action engine
Blocco in cima al dettaglio azienda con suggerimenti contestuali automatici:
- "Onboarding incompleto (60%) — Invia checklist"
- "Trial scade tra 2gg — Proponi piano Pro"
- "Inattiva da 21gg — Schedula follow-up"
- "Nessun metodo pagamento — Genera link checkout"

Logica: funzione pura che analizza stato, trial_ends_at, onboarding %, daysSinceLastOrder, payment_method.

### 6. Vista Kanban pipeline
Aggiungere toggle "Lista / Pipeline" sopra la tabella in `CompaniesList`:
- Colonne: Trial → Attivo → Sospeso → Scaduto
- Card compatte con nome, MRR, health score, giorni in stato
- Drag-and-drop opzionale (gia installato `@dnd-kit`)

## Dettagli tecnici

### Database
- Nuova tabella `company_notes` con RLS policy per super_admin
- Nessuna altra modifica DB necessaria, i dati per health/activity esistono gia

### Componenti nuovi
- `CompanyActivityTab.tsx`
- `CompanyConversionCard.tsx`
- `CompanyNotes.tsx`
- `CompanyNextActions.tsx`
- `CompanyPipelineView.tsx`

### File modificati
- `CompaniesList.tsx` — colonne Health Score + Last Login + toggle vista
- `CompanyDetail.tsx` — nuovo tab Attivita, Conversion Card, Next Actions
- `CompanyOverviewTab.tsx` — integrazione Conversion Card per trial

### Stima complessita
6 componenti nuovi, 1 migrazione DB, 3 file modificati. Nessun breaking change.

