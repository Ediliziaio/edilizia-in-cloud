

# Audit Enterprise - Sezione Contatti Marketing

## Stato Attuale (AS-IS)

La sezione Contatti e' funzionalmente completa con:
- Tabella contatti con 25 colonne configurabili, paginazione server-side, ordinamento
- Filtri avanzati con gruppi AND/OR, campi standard, tag, opportunita', custom fields
- Dialog creazione/modifica con validazione duplicati (email/phone), validazione telefono italiano
- Vista Liste contatti con CRUD, dettaglio lista, aggiunta/rimozione membri
- Import CSV con wizard multi-step e mapping campi custom
- Export CSV
- Pagina dettaglio contatto a 3 colonne (anagrafica, timeline, pannelli laterali) con inline editing
- Multi-tenancy con company_id isolato ovunque

## Problemi Identificati

### P1 - Duplicazione: AVATAR_COLORS + getInitials + getAvatarColor in 3 file
**File**: `ContactsTable.tsx` (righe 116-131), `ContactListsView.tsx` (righe 290-303), `MarketingContactDetail.tsx` (righe 220-228)
**Problema**: Le stesse costanti e funzioni helper per avatar sono copiate identiche in 3 file separati.
**Fix**: Estrarre in un file utility condiviso `src/lib/contactUtils.ts` e importare ovunque.

### P1 - Duplicazione: CustomFieldDef in 2 file
**File**: `ContactFieldsSheet.tsx` (righe 9-13, versione con 3 campi), `ContactFiltersSheet.tsx` (righe 42-48, versione con 5 campi: aggiunge `section` e `options`)
**Problema**: Due definizioni diverse dello stesso tipo. La versione in `ContactFiltersSheet` e' la superset.
**Fix**: Definire `CustomFieldDef` una sola volta nel file utility condiviso e importarlo in entrambi i file. La versione completa (con `section` e `options`) diventa il tipo unico.

### P1 - Duplicazione: OPP_STATUSES in ContactFiltersSheet
**File**: `ContactFiltersSheet.tsx` (righe 72-77)
**Problema**: `OPP_STATUSES` e' identico a `STATUS_OPTIONS` gia' centralizzato in `src/types/opportunities.ts`.
**Fix**: Importare `STATUS_OPTIONS` da `src/types/opportunities.ts` e rimuovere la costante locale.

### P1 - Performance: export CSV inline con handler asincrono nel JSX
**File**: `MarketingContacts.tsx` (righe 548-587)
**Problema**: L'intera logica di export CSV (query DB + trasformazione + download) e' scritta inline nel `onClick` di un `Button`. Questo rende il codice difficile da leggere e testare, e non gestisce lo stato di loading.
**Fix**: Estrarre in una funzione `useCallback` dedicata con gestione stato loading.

### P1 - Performance: `now` ricreato ad ogni render in ContactAppointmentsPanel
**File**: `MarketingContactDetail.tsx` (riga 67)
**Problema**: `const now = new Date()` dentro il componente crea un nuovo oggetto ad ogni render.
**Fix**: Usare `useMemo` con array vuoto per stabilizzare il riferimento.

### P2 - MarketingContactDetail.tsx: 1129 righe
**File**: `MarketingContactDetail.tsx`
**Problema**: File molto grande con componenti interni (ContactAppointmentsPanel, InlineField, OpportunitiesPanel) + logica principale. Funziona correttamente ma e' difficile da mantenere.
**Stato**: Si documenta come candidato per refactor futuro. I componenti interni `ContactAppointmentsPanel` e `OpportunitiesPanel` sono gia' ben separati come funzioni interne. Nessun intervento strutturale per minimizzare rischio regressione.

### P2 - Duplicazione: formatDate in ContactsTable
**File**: `ContactsTable.tsx` (righe 133-140)
**Problema**: La funzione `formatDate` e' definita localmente. Potrebbe essere condivisa con altri moduli che formattano date nello stesso formato italiano.
**Fix**: Estrarre nel file utility condiviso.

---

## Piano Interventi

### Intervento 1 - Creare file utility condiviso per i contatti

Creare `src/lib/contactUtils.ts` con:
- `AVATAR_COLORS` array
- `getInitials(first, last)` 
- `getAvatarColor(name)`
- `formatContactDate(dateStr)` (formattazione data italiana "dd MMM yyyy")
- `CustomFieldDef` interfaccia (versione completa con `section` e `options`)

### Intervento 2 - Aggiornare ContactsTable.tsx
- Rimuovere `AVATAR_COLORS`, `getInitials`, `getAvatarColor`, `formatDate` locali
- Importare da `src/lib/contactUtils.ts`

### Intervento 3 - Aggiornare ContactListsView.tsx
- Rimuovere `AVATAR_COLORS`, `getInitials`, `getAvatarColor` locali
- Importare da `src/lib/contactUtils.ts`

### Intervento 4 - Aggiornare MarketingContactDetail.tsx
- Rimuovere `AVATAR_COLORS`, `getAvatarColor` locali
- Importare da `src/lib/contactUtils.ts`
- Stabilizzare `now` in `ContactAppointmentsPanel` con `useMemo`

### Intervento 5 - Aggiornare ContactFieldsSheet.tsx
- Rimuovere `CustomFieldDef` locale
- Importare da `src/lib/contactUtils.ts`

### Intervento 6 - Aggiornare ContactFiltersSheet.tsx
- Rimuovere `CustomFieldDef` locale
- Importare da `src/lib/contactUtils.ts`
- Rimuovere `OPP_STATUSES` locale
- Importare `STATUS_OPTIONS` da `src/types/opportunities.ts`

### Intervento 7 - Estrarre export CSV in MarketingContacts.tsx
- Estrarre la logica di export dal `onClick` inline in una funzione `useCallback` (`handleExport`)
- Aggiungere stato `exporting` per disabilitare il bottone durante l'export

---

## Checklist Sicurezza e Multi-Tenancy

| Area | Stato |
|------|-------|
| company_id su query contatti (lista) | OK |
| company_id su query contatti (dettaglio) | OK |
| company_id su insert contatti | OK |
| company_id su import CSV | OK |
| company_id su export CSV | OK |
| company_id su liste contatti | OK |
| company_id su filtri (opportunita', custom fields) | OK |
| RLS su marketing_contacts | OK |
| RLS su marketing_contact_lists | OK |
| RLS su marketing_contact_list_members | OK |
| Validazione duplicati email/phone | OK |
| Validazione formato telefono | OK |
| Nessuna API key esposta | OK |
| effectiveCompany per impersonificazione | OK |

## Checklist Performance

| Area | Stato attuale | Dopo intervento |
|------|--------------|-----------------|
| AVATAR helpers | 3 copie | 1 file condiviso |
| CustomFieldDef | 2 copie (diverse) | 1 tipo condiviso |
| OPP_STATUSES | Duplicato | Importato da opportunities.ts |
| Export CSV | Inline nel JSX | Funzione useCallback |
| now in ContactAppointmentsPanel | Ogni render | useMemo stabile |
| formatDate | Locale in ContactsTable | Funzione condivisa |

## File Modificati (Previsti)

1. `src/lib/contactUtils.ts` (NUOVO) - utility e tipi condivisi
2. `src/components/marketing/ContactsTable.tsx` - import centralizzati
3. `src/components/marketing/ContactListsView.tsx` - import centralizzati
4. `src/pages/azienda/marketing/MarketingContactDetail.tsx` - import centralizzati + fix now
5. `src/components/marketing/ContactFieldsSheet.tsx` - import CustomFieldDef
6. `src/components/marketing/ContactFiltersSheet.tsx` - import CustomFieldDef + STATUS_OPTIONS
7. `src/pages/azienda/marketing/MarketingContacts.tsx` - estrazione export CSV

## Note

Nessuna modifica strutturale al database. Nessuna modifica al comportamento funzionale. Tutti gli interventi sono refactor behavior-preserving che eliminano duplicazioni e centralizzano tipi/costanti. Il file MarketingContactDetail (1129 righe) e' documentato come candidato per refactor futuro ma non viene toccato strutturalmente per minimizzare il rischio di regressione.

