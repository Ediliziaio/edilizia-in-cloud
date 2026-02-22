
# Audit: Impostazioni, Contatti e Opportunita

## Analisi completata

Ho esaminato in dettaglio tutti i componenti di Impostazioni (PipelinesConfig, PipelineStagesConfig, CustomFieldsConfig), Contatti (MarketingContacts, ContactDialog, ContactsTable, ContactFieldsSheet, ContactFiltersSheet) e Opportunita (MarketingOpportunities, OpportunityDialog, OpportunityDetailDialog, OpportunityKanbanView, OpportunityListView, OpportunityCard, OpportunityFiltersSheet, BulkEditSheet).

---

## 1. Pulizia codice - Elementi da rimuovere

### a) Placeholder "in arrivo" poco utili
- **MarketingOpportunities.tsx riga 339**: `toast.info("Impostazioni in arrivo")` nel dropdown menu -- non porta da nessuna parte. Sostituire con navigazione a `/azienda/impostazioni/sequenze` (gia funzionante).
- **MarketingOpportunities.tsx riga 347**: `toast.info("Elenchi personalizzati in arrivo")` -- pulsante `+ Elenco` che non fa nulla. Nasconderlo o renderlo `disabled` con tooltip.
- **MarketingOpportunities.tsx riga 360**: `toast.info("Ordinamento in arrivo")` -- pulsante Ordina che non funziona. Renderlo `disabled` con tooltip "In arrivo".

### b) Variabile `notes` in OpportunityDialog non necessaria
- **OpportunityDialog.tsx**: l'import `FileText` e il sidebar con unica voce "Dettagli dell'opportunita" non hanno funzione (dialog di creazione, non ha sidebar tabs). La sidebar e puramente decorativa e occupa 200px inutili su mobile. Tuttavia, rimuoverla cambierebbe il layout -- la segnaleremo come miglioramento UX.

---

## 2. Fix funzionali

### a) Bug: OpportunityDetailDialog grid-cols-3 troncata
- **OpportunityDetailDialog.tsx riga 606**: `grid-cols-3 gap-3` per Titolare/Follower/Call Center -- stesso problema gia corretto per MarketingContactDetail. Su schermi stretti le select vengono troncate.
- **Fix**: Cambiare da `grid-cols-3` a `grid-cols-2` come gia fatto per il dettaglio contatto.

### b) Bug: pulsante "Ordina" nelle Opportunita non funziona
- Mostra solo un toast "in arrivo" ma l'utente si aspetta funzionalita. Renderlo visivamente disabilitato per non confondere.

### c) Bug: pulsante "Impostazioni pipeline" nel dropdown va a un toast generico
- Dovrebbe navigare a `/azienda/impostazioni/sequenze` per essere utile.

### d) Possibile issue: OpportunityDialog sidebar inutile su mobile
- La sidebar con una sola voce ("Dettagli dell'opportunita") occupa spazio senza aggiungere valore. Su schermi piccoli riduce lo spazio del form.
- **Fix**: Nascondere la sidebar nella dialog di creazione (non confondere con quella di OpportunityDetailDialog che ha 5 tab).

---

## 3. Miglioramenti UX

### a) "Impostazioni pipeline" nel dropdown --> navigazione reale
- Sostituire `toast.info("Impostazioni in arrivo")` con `navigate("/azienda/impostazioni/sequenze")`.

### b) Pulsanti non funzionanti --> feedback chiaro
- Il pulsante "Ordina" e "+ Elenco" devono mostrare chiaramente che sono `disabled` con un tooltip "Funzionalita in arrivo", non un toast che sparisce.

### c) OpportunityDialog: rimuovere sidebar su creazione
- La sidebar a voce singola non aggiunge nulla. Rimuoverla per dare piu spazio al form e migliorare la UX mobile.

### d) OpportunityDetailDialog: grid-cols-2 per assegnazione
- Allineare con il fix gia fatto su MarketingContactDetail per consistenza.

---

## 4. Dettaglio tecnico delle modifiche

### File: `src/pages/azienda/marketing/MarketingOpportunities.tsx`

| Modifica | Riga | Dettaglio |
|----------|------|-----------|
| "Impostazioni pipeline" | 339 | Da `toast.info(...)` a `navigate("/azienda/impostazioni/sequenze")` |
| Pulsante "+ Elenco" | 347 | Aggiungere `disabled` e tooltip "In arrivo" |
| Pulsante "Ordina" | 360 | Aggiungere `disabled` e tooltip "In arrivo" |
| Import `useNavigate` | top | Aggiungere import di `useNavigate` |

### File: `src/components/opportunities/OpportunityDialog.tsx`

| Modifica | Riga | Dettaglio |
|----------|------|-----------|
| Rimuovere sidebar | 221-226 | Eliminare il `<div className="w-[200px] ...">` con il pulsante singolo |
| Max width dialog | 211 | Ridurre da `max-w-4xl` a `max-w-2xl` (senza sidebar, non serve cosi largo) |

### File: `src/components/opportunities/OpportunityDetailDialog.tsx`

| Modifica | Riga | Dettaglio |
|----------|------|-----------|
| Grid assegnazione | 606 | Da `grid-cols-3 gap-3` a `grid-cols-2 gap-3` |

---

## 5. Cosa NON viene toccato

- Nessun cambiamento al comportamento funzionale
- Nessuna modifica a routing, autenticazione, logica di business
- Nessuna modifica ai file auto-generati
- Impostazioni (PipelinesConfig, PipelineStagesConfig, CustomFieldsConfig): funzionano correttamente, nessun fix necessario
- ContactDialog: validazioni funzionano (duplicati, formato email/telefono), nessun fix
- Filtri opportunita e contatti: funzionano correttamente
- Bulk edit/delete: funzionano correttamente
- Drag & drop kanban: funziona correttamente
- Import/export CSV: funzionano correttamente
