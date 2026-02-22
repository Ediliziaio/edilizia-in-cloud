

# Miglioramento Opportunita - Stile GHL

## Problemi identificati

### 1. Bug Titolare/Follower - Query errata
Il dialog `OpportunityDialog.tsx` recupera gli utenti dalla tabella `profiles` filtrando solo per `company_id`, senza escludere i clienti. Deve filtrare per ruolo `company_admin` / `company_staff` tramite la tabella `user_roles`, come gia fatto in `AssignedToSelect.tsx`.

### 2. Manca il click sulla card per aprire dettagli
Attualmente le card nel kanban NON hanno un evento click per aprire un popup di dettaglio/modifica dell'opportunita. GHL mostra un dialog completo con sidebar tabs (Dettagli, Appuntamenti, Attivita, Note, Pagamenti, Oggetti Membri) quando si clicca su una card.

### 3. Nome opportunita automatico
Quando il nome opportunita non viene specificato, deve prendere automaticamente il nome del contatto selezionato (nome + citta se disponibile, come in GHL: "Paolo - Verona").

### 4. Dialog creazione troppo complesso
Il dialog attuale usa un sistema di tabs per scegliere tra contatto esistente e nuovo. In GHL e piu semplice: un singolo campo di ricerca combobox con opzione "+ nuovo (Crea nuovo contatto)" in fondo alla lista.

### 5. Grafica card e layout
Le card devono mostrare piu informazioni come in GHL: fonte dell'opportunita, valore, email e telefono del contatto, con label descrittive ("Fonte dell'opportunita:", "Valore dell'opportunita:", ecc.). Le colonne devono mostrare il conteggio opportunita e il valore totale nell'header.

---

## Piano di implementazione

### A. Fix bug Titolare/Follower (`OpportunityDialog.tsx`)
- Modificare la query `staff` per fare un join con `user_roles` e filtrare solo `company_admin` e `company_staff`
- Aggiungere campo Follower nel form (attualmente manca)
- Usare lo stesso pattern di `AssignedToSelect.tsx`

### B. Dialog dettaglio opportunita - Nuovo componente (`OpportunityDetailDialog.tsx`)
Creare un nuovo dialog che si apre al click sulla card con sidebar tabs come GHL:
- **Dettagli dell'opportunita**: form editabile con tutti i campi (nome editabile inline, sequenza, fase, stato, valore, titolare, follower, azienda, fonte, campi custom)
- **Note**: lista note con possibilita di aggiungerne di nuove (riutilizzando tabella `marketing_contact_notes` o creando `marketing_opportunity_notes`)
- **Attivita**: timeline delle attivita
- Layout: sidebar sinistra con link tabs, contenuto a destra

### C. Semplificare dialog creazione (`OpportunityDialog.tsx`)
- Sostituire il sistema tabs (Esistente/Nuovo) con un singolo campo combobox di ricerca
- In fondo alla lista risultati: link "+ nuovo (Crea nuovo contatto)" che espande i campi per il nuovo contatto
- Il nome opportunita si auto-compila con il nome del contatto + citta quando viene selezionato
- Aggiungere campo Follower

### D. Migliorare card kanban (`OpportunityCard.tsx`)
- Aggiungere label descrittive come GHL: "Fonte dell'opportunita:", "Valore dell'opportunita:", "Email del contatto:", "Telefono del contatto:"
- Mostrare il valore con formato "EUR 0.00" o simile
- Aggiungere icona utente assegnato in alto a destra (con avatar iniziali se assegnato)
- Aggiungere `onClick` per aprire il dialog dettaglio

### E. Migliorare header colonne kanban (`OpportunityKanbanView.tsx`)
- Mostrare "N Opportunita EUR X.XX" nell'header di ogni colonna come in GHL

### F. Database - Tabella note opportunita
Creare tabella `marketing_opportunity_notes` per le note associate alle opportunita:
- `id`, `opportunity_id`, `company_id`, `content`, `created_by`, `created_at`
- RLS policies standard

---

## File coinvolti

### Nuovi file (1)
1. `src/components/opportunities/OpportunityDetailDialog.tsx` - Dialog dettaglio/modifica con sidebar tabs

### File modificati (4)
1. `src/components/opportunities/OpportunityDialog.tsx` - Semplificare con combobox, fix staff query, aggiungere follower, auto-nome
2. `src/components/opportunities/OpportunityCard.tsx` - Label descrittive GHL-style, onClick per dettaglio
3. `src/components/opportunities/OpportunityKanbanView.tsx` - Passare callback onClick, migliorare header colonne
4. `src/hooks/useOpportunitiesData.ts` - Aggiungere hook `useUpdateOpportunity` per modifica completa

### Migrazione database (1)
- CREATE TABLE `marketing_opportunity_notes` con RLS

---

## Dettaglio tecnico

### Query staff corretta (fix bug critico)
```text
1. Fetch profiles WHERE company_id = X
2. Fetch user_roles WHERE user_id IN (profile_ids)
3. Filter: keep only company_admin + company_staff
```

### Auto-nome opportunita
Quando viene selezionato un contatto, il campo nome si compila con:
- `{first_name} {last_name} - {city}` se la citta e disponibile
- `{first_name} {last_name}` altrimenti
- L'utente puo sovrascrivere manualmente

### Dialog dettaglio - Tabs sidebar
| Tab | Contenuto |
|---|---|
| Dettagli dell'opportunita | Form editabile con save automatico |
| Note | Lista note + "Aggiungi Nota" |
| Attivita | Timeline (futuro, per ora placeholder) |

### Cosa NON cambia
- Nessuna modifica alla struttura pipeline/stages
- Nessuna modifica ai contatti marketing
- Nessuna modifica alla navigazione
- Drag & drop kanban rimane invariato

