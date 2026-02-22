
# Popup Dettaglio Opportunita - Identico a GHL

## Situazione attuale
Il dialog `OpportunityDetailDialog.tsx` mostra solo i campi base dell'opportunita in un layout semplice. Mancano completamente:

1. **Sezione "Contatto Dettagli"** con i campi del contatto (nome, email, telefono) e i custom fields del contatto
2. **Sezione "Opportunita Dettagli"** con i campi dell'opportunita e i custom fields dell'opportunita
3. **Sidebar completa** con tutte le tab GHL: "Dettagli dell'opportunita", "Prenota/aggiorna appuntamento", "Attivita", "Note", "Pagamenti", "Oggetti Membri"
4. **Checkbox "Nascondi campi vuoti"** in alto a destra
5. **Etichette** (tags) come campo multi-select
6. **Link "Aggiungi/gestisci campi"** in basso a sinistra
7. **Footer** con data creazione, pulsante cestino, Annulla, Aggiorna
8. **Upsert dei custom field values** sia per contatto che per opportunita

## Piano di implementazione

### A. Riscrittura completa di `OpportunityDetailDialog.tsx`

Il dialog viene ristrutturato con layout GHL:

**Header:**
- Titolo: `Modifica "Nome - Citta"`
- Sottotitolo: "Aggiungi e Modifica opportunita Dettagli, attivita, note e Appuntamento."

**Sidebar sinistra (tab):**
- Dettagli dell'opportunita (attivo)
- Prenota/aggiorna appuntamento (toast "in arrivo")
- Attivita (toast "in arrivo")
- Note (funzionante, gia implementato)
- Pagamenti (toast "in arrivo")
- Oggetti Membri (toast "in arrivo")

**Contenuto tab "Dettagli" - due macro sezioni:**

1. **Contatto Dettagli** (con checkbox "Nascondi campi vuoti")
   - Nome del contatto primario (select/input, read-only mostra il contatto collegato)
   - Email primaria
   - Telefono primario
   - Contatti aggiuntivo (placeholder "Aggiungi altri contatti")
   - Campi custom del contatto (da `marketing_custom_fields` con `object_type = 'contact'`)
   - I valori vengono letti da `marketing_contact_field_values` per il `contact_id`
   - Le modifiche ai campi contatto aggiornano `marketing_contacts` e/o `marketing_contact_field_values`

2. **Opportunita Dettagli**
   - Nome opportunita (editabile)
   - Sequenza (pipeline select, read-only)
   - Fase (stage select)
   - Stato (Aperta/Vinta/Persa/Abbandonata)
   - Valore dell'opportunita (EUR)
   - Titolare (staff select)
   - Follower (staff select)
   - Nome dell'azienda
   - Fonte dell'opportunita
   - Etichette (multi-select con i marketing_tags)
   - Campi custom dell'opportunita (da `marketing_custom_fields` con `object_type = 'opportunity'`)
   - I valori vengono letti da `marketing_opportunity_field_values` per l'`opportunity_id`

**Footer:**
- Sinistra: Link "Aggiungi/gestisci campi" (naviga a /azienda/impostazioni/campi-personalizzati)
- Info: "Creato il: data" 
- Destra: Icona cestino (elimina), Annulla, Aggiorna (salva)

### B. Nuovi hooks in `useOpportunitiesData.ts`

- `useContactCustomFields(companyId)` - Fetch custom fields con object_type = 'contact'
- `useOpportunityCustomFields(companyId)` - Fetch custom fields con object_type = 'opportunity'
- `useContactFieldValues(contactId)` - Fetch valori custom del contatto
- `useOpportunityFieldValues(opportunityId)` - Fetch valori custom dell'opportunita
- `useUpdateContactField()` - Aggiorna campo contatto su marketing_contacts
- `useUpsertContactFieldValue()` - Upsert valore custom contatto
- `useUpsertOpportunityFieldValue()` - Upsert valore custom opportunita
- `useMarketingTags()` - Fetch tags per le etichette

### C. Tabella `marketing_opportunities` - colonna tags

La tabella `marketing_opportunities` non ha una colonna `tags`. Serve una migrazione per aggiungere:
- `tags text[] NOT NULL DEFAULT '{}'` alla tabella `marketing_opportunities`

### D. Aggiornamento query `useOpportunities`

Aggiungere il fetch dei `tags` del contatto nella query esistente (gia presente come colonna `tags` su `marketing_contacts`).

---

## Dettaglio tecnico

### File modificati (2)
1. **`src/components/opportunities/OpportunityDetailDialog.tsx`** - Riscrittura completa con layout GHL a due sezioni, custom fields, tags, footer
2. **`src/hooks/useOpportunitiesData.ts`** - Aggiunta hooks per custom fields, field values, tags, update contatto

### Migrazione database (1)
- `ALTER TABLE marketing_opportunities ADD COLUMN tags text[] NOT NULL DEFAULT '{}'`

### Flusso dati nel dialog

```text
Dialog aperto con opportunity (include marketing_contacts join)
  |
  +-- Fetch marketing_custom_fields WHERE object_type='contact'
  +-- Fetch marketing_custom_fields WHERE object_type='opportunity'  
  +-- Fetch marketing_contact_field_values WHERE contact_id = opportunity.contact_id
  +-- Fetch marketing_opportunity_field_values WHERE opportunity_id = opportunity.id
  +-- Fetch marketing_tags WHERE company_id = X
  |
  +-- Render "Contatto Dettagli":
  |     - Campi base contatto (first_name, email, phone)
  |     - Custom fields contatto con i loro valori
  |
  +-- Render "Opportunita Dettagli":
        - Campi base opportunita (name, stage, status, value, etc.)
        - Tags/Etichette (multi-select)
        - Custom fields opportunita con i loro valori
```

### Salvataggio (click "Aggiorna")
1. Update `marketing_opportunities` (campi base + tags)
2. Update `marketing_contacts` (campi base contatto se modificati)
3. Upsert `marketing_contact_field_values` per ogni custom field contatto modificato
4. Upsert `marketing_opportunity_field_values` per ogni custom field opportunita modificato

### Cosa NON cambia
- Card kanban rimane invariata
- Dialog creazione rimane invariato
- Pipeline/Stages rimangono invariati
- Drag & drop rimane invariato
