
# Separazione Attivita, Sincronizzazione Task Contatti/Opportunita e Timeline Completa

## Problemi identificati

1. **Tasks mescolati**: La pagina "Attivita" in Gestione Interna (`Tasks.tsx`) carica TUTTI i task senza escludere quelli con categorie marketing (`marketing`, `contatti`, `opportunita`). Risultato: i task marketing appaiono anche nella sezione interna.

2. **Task contatti/opportunita non sincronizzati**: I task creati da un contatto non appaiono nell'opportunita collegata e viceversa. Servono filtri incrociati.

3. **Timeline centrale troppo limitata**: La colonna centrale del dettaglio contatto mostra solo aggiornamenti dei tag (inseriti manualmente via codice in `updateField`). Mancano: creazione contatto, spostamento in opportunita, cambio fase, aggiunta nota, assegnazione utente, upload documenti, ecc.

---

## Soluzione

### Parte 1: Separare i task interni da quelli marketing

**File: `src/pages/azienda/Tasks.tsx`**
- Aggiungere un filtro `.not("category", "in", "(marketing,contatti,opportunita)")` alla query Supabase, in modo che la pagina Attivita interna mostri solo categorie operative (generale, ordini, magazzino, pagamenti, costi).

### Parte 2: Sincronizzare task contatti/opportunita

**File: `src/components/tasks/LinkedTasks.tsx`**
- Quando il componente e usato nel contesto di un contatto (`contactId` presente), caricare anche i task che hanno un `opportunity_id` collegato a un'opportunita di quel contatto (query incrociata).
- Quando usato nel contesto di un'opportunita (`opportunityId` presente), caricare anche i task generici del contatto collegato.

### Parte 3: Timeline completa del contatto (registro attivita)

Attualmente la tabella `marketing_contact_activities` esiste ma viene alimentata solo da due punti nel codice (aggiornamento campo e aggiunta nota in `MarketingContactDetail.tsx`). Serve ampliare la registrazione con trigger database per catturare automaticamente tutti gli eventi importanti.

**Database - Nuovi trigger**:

Creare trigger database su:

| Tabella | Evento | Tipo attivita registrata |
|---------|--------|--------------------------|
| `marketing_contacts` | INSERT | `contact_created` - "Contatto creato" |
| `marketing_opportunities` | INSERT | `opportunity_created` - "Opportunita creata: {nome}" |
| `marketing_opportunities` | UPDATE di `stage_id` | `stage_changed` - "Fase cambiata: {vecchia} -> {nuova}" |
| `marketing_opportunities` | UPDATE di `status` | `status_changed` - "Stato opportunita: {stato}" |
| `marketing_opportunities` | UPDATE di `assigned_to` | `opportunity_assigned` - "Opportunita assegnata" |
| `marketing_contact_notes` | INSERT | `note_added` - "Nota aggiunta" |
| `marketing_documents` | INSERT | `document_uploaded` - "Documento caricato: {nome}" |
| `marketing_contacts` | UPDATE di `assigned_to` | `contact_assigned` - "Contatto assegnato a {utente}" |

Questi trigger inseriranno automaticamente righe in `marketing_contact_activities` con il `contact_id` corretto (per le opportunita, risalendo tramite la FK `contact_id` sulla tabella `marketing_opportunities`).

**File: `src/pages/azienda/marketing/MarketingContactDetail.tsx`**
- Rimuovere gli inserimenti manuali in `marketing_contact_activities` dal codice frontend (linee 335-342 e 376-383), dato che ora i trigger database li gestiscono automaticamente.
- Aggiungere nuovi tipi di attivita alle funzioni `getActivityIcon` e `getActivityColor`:
  - `contact_created` (icona: UserPlus, colore: verde)
  - `opportunity_created` (icona: Target, colore: viola)
  - `stage_changed` (icona: ArrowRight, colore: blu)
  - `status_changed` (icona: RefreshCw, colore: arancione)
  - `opportunity_assigned` (icona: UserCheck, colore: indaco)
  - `contact_assigned` (icona: UserCheck, colore: indaco)
  - `document_uploaded` (icona: FileText, colore: ciano)
- Rendere il pulsante "Dettagli" funzionale: al click mostrare i metadati dell'attivita (campo `metadata` JSONB) in un popover con le informazioni dettagliate del cambiamento.

---

## Riepilogo tecnico delle modifiche

| Area | File/Risorsa | Tipo | Modifica |
|------|--------------|------|----------|
| Task separazione | `src/pages/azienda/Tasks.tsx` | Modifica | Escludere categorie marketing dalla query |
| Task sync | `src/components/tasks/LinkedTasks.tsx` | Modifica | Cross-query contatti/opportunita |
| Timeline | Database (migrazione SQL) | Nuovo | Trigger per registrare automaticamente tutte le attivita |
| Timeline | `MarketingContactDetail.tsx` | Modifica | Rimuovere inserimenti manuali attivita, aggiungere nuove icone/colori, popover dettagli |

### Dettaglio SQL dei trigger

I trigger verranno implementati come funzioni PL/pgSQL che inseriscono in `marketing_contact_activities`:

```sql
-- Esempio: trigger per creazione contatto
CREATE FUNCTION log_contact_created() RETURNS trigger AS $$
BEGIN
  INSERT INTO marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
  VALUES (NEW.id, NEW.company_id, 'contact_created', 'Contatto creato', '{}', COALESCE(auth.uid(), NEW.assigned_to));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_contact_created 
  AFTER INSERT ON marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION log_contact_created();

-- Esempio: trigger per cambio fase opportunita
CREATE FUNCTION log_opportunity_stage_change() RETURNS trigger AS $$
DECLARE
  old_stage_name text;
  new_stage_name text;
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    SELECT name INTO old_stage_name FROM marketing_pipeline_stages WHERE id = OLD.stage_id;
    SELECT name INTO new_stage_name FROM marketing_pipeline_stages WHERE id = NEW.stage_id;
    INSERT INTO marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
    VALUES (NEW.contact_id, NEW.company_id, 'stage_changed',
      'Fase cambiata: ' || COALESCE(old_stage_name,'?') || ' → ' || COALESCE(new_stage_name,'?'),
      jsonb_build_object('old_stage', old_stage_name, 'new_stage', new_stage_name, 'opportunity_name', NEW.name),
      COALESCE(auth.uid(), NEW.assigned_to));
  END IF;
  -- ... analoghi per status e assigned_to
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Ogni trigger registra `metadata` JSONB con i dettagli del cambiamento (valori vecchi/nuovi), rendendo la timeline un registro completo e preparato per future integrazioni (WhatsApp, SMS, email).
