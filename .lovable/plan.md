
# Audit Enterprise - Sezione Opportunita' Marketing & Vendite

## Stato Attuale (AS-IS)

La sezione Opportunita' e' funzionalmente completa con:
- Vista Kanban con drag & drop (dnd-kit), DragOverlay, sensori touch/pointer/keyboard
- Vista Lista con tabella, checkbox select-all, ordinamento
- Dialog creazione con combobox contatto, creazione inline nuovo contatto, custom fields
- Dialog dettaglio a 5 tab (Dettagli, Appuntamenti, Attivita', Note, Documenti)
- Filtri avanzati (stato, titolare, follower, call center, fonte, valore, data, tag)
- Bulk edit e bulk delete con conferma
- Personalizzazione campi card (CardCustomizeSheet) con anteprima live e 3 layout
- Import CSV con wizard multi-step e mapping campi custom
- Export CSV
- Tag sync bidirezionale contatto-opportunita'
- Appuntamento booking con geocodifica, disponibilita' slot, distanza dalla base
- Multi-tenancy con company_id isolato ovunque

## Problemi Identificati

### P1 - Duplicazione: interfaccia `Stage` in 2 file
**File**: `OpportunityKanbanView.tsx` (riga 12-17), `OpportunityListView.tsx` (riga 13-18)
**Problema**: L'interfaccia `Stage` con `id`, `name`, `position`, `auto_status` e' definita identica in 2 file.
**Fix**: Creare un tipo condiviso in `src/types/opportunities.ts` e importarlo ovunque. Includere anche il tipo `OpportunityStatus` e la mappa `STATUS_MAP`.

### P1 - Duplicazione: costanti status in 3 file
**File**: `OpportunityListView.tsx` (STATUS_MAP), `OpportunityFiltersSheet.tsx` (STATUS_OPTIONS), `OpportunityDialog.tsx` (statusOptions locale)
**Problema**: Le opzioni di stato (`open/Aperta`, `won/Vinta`, `lost/Persa`, `abandoned/Abbandonata`) sono definite 3 volte con formati diversi (mappa oggetto, array, array locale).
**Fix**: Centralizzare in `src/types/opportunities.ts` sia come mappa che come array, importare ovunque.

### P1 - Performance: N+1 query nel data hook
**File**: `src/hooks/useOpportunitiesData.ts` (riga 44-86)
**Problema**: La funzione `useOpportunities` esegue query separate per profiles, notes count, docs count e appointments dopo la query principale. Per pipeline con molte opportunita', questo causa 4 round-trip aggiuntivi al database.
**Stato**: Accettabile per volumi medio-bassi. Le query parallele (`Promise.all`) mitigano il problema. Nessun intervento immediato richiesto, ma si puo' consolidare con un database function in futuro.

### P1 - Performance: `hashColor` ricalcolato ad ogni render
**File**: `OpportunityListView.tsx` (riga 34-38)
**Problema**: La funzione `hashColor` e' pura ma viene chiamata inline dentro il render di ogni riga. Per liste lunghe, puo' essere ottimizzata.
**Fix**: Spostare `hashColor` nel file di utilita' condiviso (`src/types/opportunities.ts` o `src/lib/opportunityUtils.ts`). Essendo una funzione pura senza dipendenze React, non causa re-render ma il refactor migliora la manutenibilita'.

### P2 - OpportunityDetailDialog: file da 782 righe
**File**: `src/components/opportunities/OpportunityDetailDialog.tsx`
**Problema**: Il file e' molto lungo (782 righe) con logica mista UI + business. Contiene il rendering di 5 tab + logica di salvataggio + cambio contatto + tag sync + custom fields.
**Stato**: Funziona correttamente. Un refactor di estrazione tab sarebbe ideale ma rappresenta un rischio di regressione elevato. Si documenta come P2 senza intervento immediato per rispettare il vincolo "non rompere nulla".

### P2 - BulkEditSheet: status options duplicate
**File**: `src/components/opportunities/BulkEditSheet.tsx` (righe 126-131)
**Problema**: Le opzioni di stato sono inline nel JSX (`<SelectItem value="open">Aperta</SelectItem>`).
**Fix**: Importare dalla costante centralizzata.

---

## Piano Interventi

### Intervento 1 - Centralizzare tipi e costanti delle opportunita'

Creare `src/types/opportunities.ts`:
- Interfaccia `OpportunityStage` (id, name, position, auto_status)
- `STATUS_OPTIONS` array: `[{ value: "open", label: "Aperta" }, ...]`
- `STATUS_MAP` oggetto: `{ open: { label: "Aperta", className: "..." }, ... }`
- Funzione `hashColor(name: string): string`

### Intervento 2 - Aggiornare i file per usare i tipi centralizzati

File da aggiornare:
1. `src/components/opportunities/OpportunityKanbanView.tsx` - rimuovere `interface Stage` locale, importare `OpportunityStage`
2. `src/components/opportunities/OpportunityListView.tsx` - rimuovere `interface Stage`, `STATUS_MAP`, `hashColor` locali, importare dal tipo condiviso
3. `src/components/opportunities/OpportunityFiltersSheet.tsx` - rimuovere `STATUS_OPTIONS` locale, importare
4. `src/components/opportunities/OpportunityDialog.tsx` - rimuovere `statusOptions` locale, importare `STATUS_OPTIONS`
5. `src/components/opportunities/BulkEditSheet.tsx` - usare `STATUS_OPTIONS` importato al posto dei `SelectItem` inline
6. `src/components/opportunities/OpportunityDetailDialog.tsx` - importare `STATUS_OPTIONS` per i select dello stato (righe 588-594)

### Intervento 3 - Verifica e allineamento props Stage

Il tipo `Stage` e' usato anche nella page padre `MarketingOpportunities.tsx` come `any` implicito. Verificare che `stages` venga tipizzato con `OpportunityStage[]` anche li'.

---

## Checklist Sicurezza e Multi-Tenancy

| Area | Stato |
|------|-------|
| company_id su query opportunita' | OK |
| company_id su query contatti | OK |
| company_id su query pipeline/stages | OK |
| company_id su insert opportunita' | OK |
| company_id su import CSV | OK |
| RLS su marketing_opportunities | OK |
| RLS su marketing_contacts | OK |
| RLS su marketing_pipeline_stages | OK |
| Validazione input (nome obbligatorio) | OK |
| Nessuna API key esposta | OK |
| effectiveCompany per impersonificazione | OK |
| Bulk operations tenant-scoped | OK |

## Checklist Performance

| Area | Stato attuale | Dopo intervento |
|------|--------------|-----------------|
| Stage interface | 2 copie | 1 tipo condiviso |
| STATUS_MAP/OPTIONS | 3 copie | 1 costante condivisa |
| hashColor | locale in ListView | utility condivisa |
| N+1 query profiles/notes/docs | Promise.all (accettabile) | Invariato (gia' parallelo) |
| Kanban memo | OK (memo su StageColumn) | Invariato |
| ListView memo | OK (memo wrapper) | Invariato |

## File Modificati (Previsti)

1. `src/types/opportunities.ts` (NUOVO) - tipi e costanti condivisi
2. `src/components/opportunities/OpportunityKanbanView.tsx` - import tipo Stage
3. `src/components/opportunities/OpportunityListView.tsx` - import Stage, STATUS_MAP, hashColor
4. `src/components/opportunities/OpportunityFiltersSheet.tsx` - import STATUS_OPTIONS
5. `src/components/opportunities/OpportunityDialog.tsx` - import STATUS_OPTIONS
6. `src/components/opportunities/BulkEditSheet.tsx` - import STATUS_OPTIONS
7. `src/components/opportunities/OpportunityDetailDialog.tsx` - import STATUS_OPTIONS

## Note

Nessuna modifica strutturale al database. Nessuna modifica al comportamento funzionale. Tutti gli interventi sono refactor behavior-preserving che eliminano duplicazioni e centralizzano tipi/costanti. Il file OpportunityDetailDialog (782 righe) e' documentato come candidato per un refactor futuro di estrazione componenti per tab, ma non viene toccato strutturalmente per minimizzare il rischio di regressione.
