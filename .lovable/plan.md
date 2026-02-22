
# Note cliccabili, Documenti sincronizzati e pulizia sidebar Opportunita

## 1. Icone Note e Documenti sulla card opportunita

Attualmente le icone "Note" e "Documenti" sulla card mostrano solo "funzionalita in arrivo". Verranno modificate per aprire il dialog dell'opportunita direttamente sulla tab corrispondente.

**File: `src/components/opportunities/OpportunityCard.tsx`**
- Modificare le azioni delle icone Note e Documenti per invocare `onClick` con un parametro che indica la tab da aprire
- Aggiornare l'interfaccia `OpportunityCardProps` per aggiungere `onOpenTab?: (tab: string) => void`

**File: `src/components/opportunities/OpportunityKanbanView.tsx`**
- Passare la callback `onOpenTab` alla card per aprire il dialog sulla tab corretta

## 2. Database: tabella documenti marketing

Creare una nuova tabella `marketing_documents` per documenti condivisi tra contatti e opportunita:

```sql
CREATE TABLE marketing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES marketing_contacts(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES marketing_opportunities(id) ON DELETE SET NULL,
  company_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies (stesse logiche delle altre tabelle marketing)
ALTER TABLE marketing_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage marketing documents"
  ON marketing_documents FOR ALL
  USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view marketing documents if permitted"
  ON marketing_documents FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders') AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all marketing documents"
  ON marketing_documents FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));
```

Creare un nuovo storage bucket `marketing-attachments` (pubblico).

## 3. Documenti nel contact detail (sidebar destra)

**File: `src/pages/azienda/marketing/MarketingContactDetail.tsx`**
- Sostituire il placeholder "Ancora nessun documento" con un componente funzionale che:
  - Mostra i documenti caricati (lista con nome, tipo, data, badge "Opportunita" se collegato)
  - Permette upload di file (PDF, PNG, JPG, DOC, ecc.) tramite Supabase Storage
  - Permette download e eliminazione dei documenti
  - I documenti sono collegati al `contact_id`, opzionalmente a un `opportunity_id`

## 4. Documenti nel dialog opportunita

**File: `src/components/opportunities/OpportunityDetailDialog.tsx`**
- Aggiungere tab "documents" al tipo `Tab`
- Aggiungere voce "Documenti" alla sidebar (con icona `FileText`)
- Rimuovere "Pagamenti" e "Oggetti Membri" dalla sidebar
- Nel contenuto della tab "documents":
  - Mostrare documenti filtrati per `opportunity_id` + documenti generici del contatto
  - Permettere upload, download, eliminazione
  - Badge visivo per distinguere documenti dell'opportunita vs del contatto

## 5. Rimuovere Pagamenti e Oggetti Membri

**File: `src/components/opportunities/OpportunityDetailDialog.tsx`**
- Rimuovere le voci `payments` e `members` dall'array `sidebarTabs`
- Rimuovere `CreditCard` e `Users` dagli import se non usati altrove
- Aggiornare il tipo `Tab` eliminando "payments" e "members"

## Riepilogo modifiche

| File | Modifica |
|------|----------|
| **Database** | Creare tabella `marketing_documents` + bucket `marketing-attachments` |
| `OpportunityCard.tsx` | Note e Documenti aprono il dialog sulla tab giusta |
| `OpportunityKanbanView.tsx` | Passare callback `onOpenTab` |
| `OpportunityDetailDialog.tsx` | Aggiungere tab "Documenti", rimuovere "Pagamenti" e "Oggetti Membri", upload/download documenti |
| `MarketingContactDetail.tsx` | Rendere funzionale il pannello "Documenti" con upload/download/lista |

## Dettagli tecnici

### OpportunityCard - apertura tab specifica

L'interfaccia viene estesa con `onOpenTab`:

```
interface OpportunityCardProps {
  opportunity: any;
  onClick?: () => void;
  onOpenTab?: (tab: string) => void;  // NUOVO
  onDelete?: (id: string) => void;
  ...
}
```

Le icone Note e Documenti chiamano `onOpenTab("notes")` e `onOpenTab("documents")` invece di mostrare "in arrivo".

### OpportunityDetailDialog - nuova tab Documenti

Il tipo `Tab` diventa:

```
type Tab = "details" | "notes" | "appointments" | "activities" | "documents";
```

La sidebar aggiornata:

```
sidebarTabs = [
  { key: "details", label: "Dettagli dell'opportunita", icon: FileText, enabled: true },
  { key: "appointments", label: "Prenota/aggiorna appuntamento", icon: CalendarDays, enabled: false },
  { key: "activities", label: "Attivita", icon: Activity, enabled: true },
  { key: "notes", label: "Note", icon: StickyNote, enabled: true },
  { key: "documents", label: "Documenti", icon: Folder, enabled: true },   // NUOVO
];
```

### Upload documenti

Il flusso di upload segue lo stesso pattern di `OrderAttachments`:
1. Input file nascosto con accept per PDF, immagini, documenti
2. Upload su Supabase Storage bucket `marketing-attachments`
3. Salvataggio metadata nella tabella `marketing_documents`
4. Visualizzazione con icone per tipo file, nome, dimensione, data
5. Azioni: download e elimina

### Sincronizzazione documenti contatto/opportunita

Come per le note, i documenti sono salvati con `contact_id` obbligatorio e `opportunity_id` opzionale:
- Nella pagina contatto: si vedono TUTTI i documenti del contatto
- Nel dialog opportunita: si vedono i documenti con quel `opportunity_id` + quelli generici del contatto
- Quando si carica un documento dal dialog opportunita, viene salvato con entrambi gli ID
