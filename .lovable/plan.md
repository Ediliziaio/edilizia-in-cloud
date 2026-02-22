
# Audit Completo: Contatti e Opportunita - Pulizia, Bug Fix e UX

## Analisi Completata

Ho analizzato in dettaglio tutti i file relativi a Contatti e Opportunita. Il codebase e generalmente ben strutturato, ma ho identificato diversi problemi da correggere.

---

## 1. BUG TROVATI E FIX

### BUG-1: Query note/documenti puo superare il limite di 1000 righe
**File:** `src/hooks/useOpportunitiesData.ts` (righe 62-83)
**Problema:** Le query per contare note e documenti (`marketing_contact_notes`, `marketing_documents`) selezionano tutte le righe e poi contano lato client. Con molti dati, il default limit di 1000 righe di Supabase troncherebbe i risultati, dando conteggi errati.
**Fix:** Usare un approccio con conteggio aggregato tramite query separate per ogni opportunity, oppure in alternativa fare la query con `.select("opportunity_id", { count: "exact", head: true })` raggruppata. Soluzione pratica: aggiungere `.limit(10000)` alle query per coprire scenari realistici, oppure riscrivere con RPC per conteggi reali.

### BUG-2: `useOpportunityNotes` mostra TUTTE le note del contatto, non solo quelle dell'opportunita
**File:** `src/hooks/useOpportunitiesData.ts` (righe 266-270)
**Problema:** Quando `contactId` e presente, la query recupera tutte le note del contatto senza filtrare per `opportunity_id`. Questo potrebbe confondere l'utente mostrando note di altre opportunita. Tuttavia il badge "Altra opp." nel dialog le distingue visivamente, quindi e un comportamento intenzionale. Nessun fix necessario, ma da documentare.

### BUG-3: Contatto non aggiornato nel dialog dopo cambio contatto
**File:** `src/components/opportunities/OpportunityDetailDialog.tsx` (riga 235)
**Problema:** Quando si cambia contatto (`pendingContactId` presente), i campi email/phone/city vengono aggiornati ma il `contactCity` non viene resettato correttamente nel caso del "Cambia contatto". Il `handleSelectExistingContact` (riga 303-310) aggiorna `contactEmail` e `contactPhone` ma non `contactCity`.
**Fix:** Aggiungere `setContactCity(c.city || "")` nella funzione `handleSelectExistingContact`.

### BUG-4: Import opportunita - conteggio note/documenti non aggiornato dopo import
**File:** `src/pages/azienda/marketing/MarketingOpportunities.tsx`
**Problema:** Dopo un import massivo, la query cache non viene invalidata per i conteggi note/documenti.
**Fix:** La `queryClient.invalidateQueries` gia presente per `marketing_opportunities` copre questo caso perche il fetch dei conteggi e incluso nella stessa query. Nessun fix necessario.

### BUG-5: `OpportunityDetailDialog` - `forwardRef` con ref non utilizzato
**File:** `src/components/opportunities/OpportunityDetailDialog.tsx` (riga 50)
**Problema:** Il componente usa `forwardRef` ma il `_ref` non viene mai passato al DOM. Codice inutile.
**Fix:** Rimuovere `forwardRef` e usare un componente funzionale standard.

---

## 2. PULIZIA CODICE

### RIMOZIONE-1: Import inutili in `OpportunityDetailDialog.tsx`
- `X as XIcon` (riga 29) - mai usato nel JSX
- `File, Image, FileSpreadsheet` (riga 29) - usati solo in `MarketingDocumentsPanel`, non in questo file
- `Upload, Download` (riga 29) - non usati direttamente

### RIMOZIONE-2: `forwardRef` non necessario in `OpportunityDetailDialog.tsx`
Il componente non espone alcun ref al parent. Semplificare la dichiarazione.

### RIMOZIONE-3: Commento obsoleto (riga 38)
```
// Note: useNavigate kept for "Aggiungi/gestisci campi" link in footer
```
Commento inutile, il `useNavigate` e chiaramente usato.

### RIMOZIONE-4: Variabili non usate in `OpportunityCard.tsx`
- `_ref` nel `forwardRef` (riga 26) - non usato, il `setNodeRef` di dnd-kit e quello attuale

---

## 3. MIGLIORAMENTI UX

### UX-1: Feedback visivo quando si clicca "Aggiorna" nel dettaglio opportunita
Gia presente (spinner su bottone). OK.

### UX-2: Aggiungere `contactCity` nel `handleSelectExistingContact`
Quando si seleziona un contatto esistente dal dropdown di cambio contatto, la citta non viene mostrata. Dopo il fix BUG-3, l'utente vedra immediatamente la citta del nuovo contatto selezionato.

### UX-3: Tooltip mancante sull'icona "Note" quando ci sono note
Attualmente il tooltip dice solo "Note". Migliorare: se ci sono note, mostrare "Note (X)" nel tooltip.

### UX-4: Tooltip migliorato sull'icona "Documenti" quando ci sono documenti
Come sopra, mostrare "Documenti (X)" nel tooltip.

---

## 4. DETTAGLIO TECNICO DELLE MODIFICHE

### File 1: `src/components/opportunities/OpportunityDetailDialog.tsx`

| Azione | Dettaglio |
|--------|-----------|
| Rimuovere `forwardRef` | Semplificare la dichiarazione del componente |
| Rimuovere import inutili | `X as XIcon`, `File`, `Image`, `FileSpreadsheet`, `Upload`, `Download` |
| Rimuovere commento riga 38 | Commento obsoleto su useNavigate |
| Fix `handleSelectExistingContact` | Aggiungere `setContactCity(c.city or "")` |

### File 2: `src/components/opportunities/OpportunityCard.tsx`

| Azione | Dettaglio |
|--------|-----------|
| Migliorare tooltip Note | Da "Note" a "Note (X)" se count > 0 |
| Migliorare tooltip Documenti | Da "Documenti" a "Documenti (X)" se count > 0 |

### File 3: `src/hooks/useOpportunitiesData.ts`

| Azione | Dettaglio |
|--------|-----------|
| Mitigare limite 1000 righe | Aggiungere `.limit(5000)` alle query di conteggio note/documenti per coprire scenari piu grandi |

---

## 5. VERIFICA FUNZIONALITA (Checklist)

| Funzionalita | Stato |
|--------------|-------|
| Creazione contatto | OK - Dialog con validazione, campi custom supportati |
| Modifica contatto | OK - Pre-popolamento corretto, tag sync bidirezionale |
| Eliminazione contatto | OK - Bulk delete supportato |
| Creazione opportunita | OK - Auto-naming da contatto, custom fields salvati |
| Spostamento opportunita (drag) | OK - Optimistic update con rollback |
| Associazione contatto-opportunita | OK - Cambio contatto con ricerca e creazione inline |
| Filtri avanzati | OK - Multi-gruppo, filtri per tag/stato/valore/data/custom fields |
| Ricerca | OK - Full-text su nome/email/telefono/azienda |
| Importazione CSV | OK - Contatti e opportunita con custom fields |
| Esportazione CSV | OK - Tutti i campi principali |
| Paginazione (contatti) | OK - Con page size variabile |
| Bulk actions | OK - Modifica in blocco fase/stato/valore/titolare/follower/fonte |
| Bulk delete | OK - Con conferma dialog |
| Pipeline sync | OK - auto_status su cambio fase |
| Custom fields contatto | OK - Salvati, caricati, filtrabili |
| Custom fields opportunita | OK - Salvati, caricati, visibili nel detail |
| Assegnazione utenti | OK - Titolare, Follower, Call Center |
| Tag sync bidirezionale | OK - Contatto-Opportunita e viceversa |
| Navigazione contatto da card | OK - Click su nome naviga al dettaglio contatto |
| Badge conteggi (tag/note/doc) | OK - Visibili sulle icone della card |

---

## 6. COMPONENTI/FILE NON TOCCATI (nessuna rimozione di file)

Non ci sono file da eliminare. Tutti i componenti delle sezioni Contatti e Opportunita sono attivamente utilizzati.

---

## Riepilogo Modifiche

3 file modificati, 0 file eliminati:
1. `OpportunityDetailDialog.tsx` - Pulizia import, rimozione forwardRef, fix city su cambio contatto
2. `OpportunityCard.tsx` - Tooltip migliorati con conteggi
3. `useOpportunitiesData.ts` - Mitigazione limite query
