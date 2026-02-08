
# Piano: Gestione Documenti per Dipendenti e Squadre Esterne

## Panoramica

Implementazione della possibilita di caricare e gestire documenti sia per i dipendenti interni che per le squadre esterne. Questo permette di archiviare documenti come:
- Contratti di lavoro
- Documenti di identita
- Certificazioni
- Patenti
- Visure camerali (per squadre esterne)
- Polizze assicurative
- Altri documenti aziendali

---

## 1. Modifiche Database

### 1.1 Nuova Tabella `employee_attachments`

Archivia i documenti dei dipendenti interni:

```sql
CREATE TABLE employee_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  document_type text,  -- es. "contratto", "documento_identita", "certificazione"
  expiry_date date,    -- per documenti con scadenza
  notes text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 1.2 Nuova Tabella `external_team_attachments`

Archivia i documenti delle squadre esterne:

```sql
CREATE TABLE external_team_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_team_id uuid NOT NULL REFERENCES external_teams(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  document_type text,  -- es. "visura_camerale", "polizza", "durc"
  expiry_date date,    -- per documenti con scadenza
  notes text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 1.3 Politiche RLS

```sql
-- Employee Attachments
CREATE POLICY "Company admins can manage their employee attachments"
  ON employee_attachments FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    EXISTS (
      SELECT 1 FROM employees e 
      WHERE e.id = employee_attachments.employee_id 
      AND e.company_id = get_user_company_id(auth.uid())
    )
  );

-- External Team Attachments
CREATE POLICY "Company admins can manage their external team attachments"
  ON external_team_attachments FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    EXISTS (
      SELECT 1 FROM external_teams t 
      WHERE t.id = external_team_attachments.external_team_id 
      AND t.company_id = get_user_company_id(auth.uid())
    )
  );
```

---

## 2. Storage

Utilizzo del bucket esistente `order-attachments` (che e gia pubblico) oppure creazione di un nuovo bucket dedicato `personnel-attachments`.

Struttura dei file:
```
personnel-attachments/
├── employees/
│   └── {employee_id}/
│       └── {timestamp}-{filename}
└── external-teams/
    └── {team_id}/
        └── {timestamp}-{filename}
```

---

## 3. Interfaccia Utente

### 3.1 Nuovo Approccio: Pagina Dettaglio Dipendente/Squadra

Invece di mostrare i documenti nella tabella principale, aggiungo un pulsante "Documenti" che apre una sezione dedicata o un dialog espandibile.

### Layout Proposto - Tab Dipendenti

```
┌─────────────────────────────────────────────────────────────────┐
│ Dipendenti Interni (5)                            [+ Nuovo]    │
├───────────┬───────────┬──────────┬──────────┬─────────┬────────┤
│ Nome      │ Contatti  │ Stipendio│ Costo/h  │ Stato   │ Azioni │
├───────────┼───────────┼──────────┼──────────┼─────────┼────────┤
│ Mario     │ mario@... │ € 2.500  │ € 15,62/h│ Attivo  │ [📄][✏️][🗑️]
│ Rossi     │           │          │          │         │         │
├───────────┼───────────┼──────────┼──────────┼─────────┼────────┤
│ Luigi     │ luigi@... │ € 2.200  │ € 13,75/h│ Attivo  │ [📄][✏️][🗑️]
│ Bianchi   │           │          │          │         │         │
└───────────┴───────────┴──────────┴──────────┴─────────┴────────┘

[📄] = Pulsante per aprire i documenti
```

### 3.2 Dialog Documenti

Cliccando su [📄] si apre un dialog simile a quello degli allegati ordine:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📄 Documenti - Mario Rossi                                      │
│ Gestisci i documenti del dipendente                            │
├─────────────────────────────────────────────────────────────────┤
│                                              [+ Carica File]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📄 Contratto_lavoro.pdf                        1.2 MB     │  │
│ │    Tipo: Contratto  |  Scadenza: --                       │  │
│ │                                           [📥] [🗑️]       │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 🖼️ Documento_identita.jpg                     450 KB      │  │
│ │    Tipo: Documento Identita  |  Scadenza: 15/03/2028      │  │
│ │                                           [📥] [🗑️]       │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📄 Patente_guida.pdf                          300 KB      │  │
│ │    Tipo: Patente  |  Scadenza: 20/06/2030                 │  │
│ │                                           [📥] [🗑️]       │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Form Upload

```
┌─────────────────────────────────────────────────────────────────┐
│ Carica Documento                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Tipo Documento                                                  │
│ [▼ Contratto                                               ]    │
│     ├─ Contratto                                                │
│     ├─ Documento Identita                                       │
│     ├─ Patente                                                  │
│     ├─ Certificazione                                           │
│     └─ Altro                                                    │
│                                                                 │
│ Data Scadenza (opzionale)                                       │
│ [📅 Seleziona data________________________]                     │
│                                                                 │
│ Note (opzionale)                                                │
│ [________________________________]                              │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │                                                           │  │
│ │        [📎 Clicca per selezionare un file]               │  │
│ │           o trascinalo qui                                │  │
│ │                                                           │  │
│ │        PDF, Word, Excel, immagini. Max 10MB              │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                              [Annulla] [Carica]                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Tipi di Documento Predefiniti

### Dipendenti

| Valore | Label |
|--------|-------|
| `contratto` | Contratto di Lavoro |
| `documento_identita` | Documento di Identita |
| `patente` | Patente di Guida |
| `certificazione` | Certificazione |
| `attestato` | Attestato Formazione |
| `altro` | Altro |

### Squadre Esterne

| Valore | Label |
|--------|-------|
| `visura_camerale` | Visura Camerale |
| `durc` | DURC |
| `polizza` | Polizza Assicurativa |
| `contratto` | Contratto |
| `fattura` | Fattura |
| `altro` | Altro |

---

## 5. File da Creare/Modificare

| File | Operazione | Descrizione |
|------|------------|-------------|
| `supabase/migrations/xxx.sql` | Creare | Nuove tabelle + bucket storage |
| `src/components/employees/EmployeeAttachments.tsx` | Creare | Componente gestione documenti dipendente |
| `src/components/employees/ExternalTeamAttachments.tsx` | Creare | Componente gestione documenti squadra |
| `src/pages/azienda/Employees.tsx` | Modificare | Aggiungere pulsante documenti nella tabella |
| `src/lib/documentTypes.ts` | Creare | Costanti per tipi documento |

---

## Sezione Tecnica

### Struttura Componente EmployeeAttachments

```typescript
interface EmployeeAttachment {
  id: string;
  employee_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  document_type: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
}

interface EmployeeAttachmentsProps {
  employee: {
    id: string;
    first_name: string;
    last_name: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

### Query per Fetch Documenti

```typescript
const { data: attachments } = useQuery({
  queryKey: ["employee-attachments", employeeId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("employee_attachments")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    return data;
  },
});
```

### Upload File

```typescript
const handleUpload = async (file: File, documentType: string, expiryDate?: Date) => {
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const filePath = `employees/${employeeId}/${timestamp}-${sanitizedName}`;

  // Upload to storage
  await supabase.storage
    .from("personnel-attachments")
    .upload(filePath, file);

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from("personnel-attachments")
    .getPublicUrl(filePath);

  // Save to database
  await supabase.from("employee_attachments").insert({
    employee_id: employeeId,
    file_name: file.name,
    file_url: publicUrl,
    file_type: file.type,
    file_size: file.size,
    document_type: documentType,
    expiry_date: expiryDate?.toISOString().split("T")[0],
    uploaded_by: user.id,
  });
};
```

### Costanti Tipi Documento

```typescript
// src/lib/documentTypes.ts

export const EMPLOYEE_DOCUMENT_TYPES = [
  { value: "contratto", label: "Contratto di Lavoro" },
  { value: "documento_identita", label: "Documento di Identità" },
  { value: "patente", label: "Patente di Guida" },
  { value: "certificazione", label: "Certificazione" },
  { value: "attestato", label: "Attestato Formazione" },
  { value: "altro", label: "Altro" },
] as const;

export const EXTERNAL_TEAM_DOCUMENT_TYPES = [
  { value: "visura_camerale", label: "Visura Camerale" },
  { value: "durc", label: "DURC" },
  { value: "polizza", label: "Polizza Assicurativa" },
  { value: "contratto", label: "Contratto" },
  { value: "fattura", label: "Fattura" },
  { value: "altro", label: "Altro" },
] as const;

export const getDocumentTypeLabel = (
  value: string, 
  types: typeof EMPLOYEE_DOCUMENT_TYPES | typeof EXTERNAL_TEAM_DOCUMENT_TYPES
) => {
  return types.find(t => t.value === value)?.label || value;
};
```

### Creazione Bucket Storage

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('personnel-attachments', 'personnel-attachments', true);

-- Policies per upload
CREATE POLICY "Company admins can upload personnel attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'personnel-attachments' AND
  has_role(auth.uid(), 'company_admin')
);

-- Policies per lettura
CREATE POLICY "Company admins can read personnel attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'personnel-attachments');

-- Policies per eliminazione
CREATE POLICY "Company admins can delete personnel attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'personnel-attachments' AND
  has_role(auth.uid(), 'company_admin')
);
```

---

## 6. Alert Scadenze (Opzionale Futuro)

Una volta implementata la gestione documenti con date di scadenza, sara possibile in futuro aggiungere:
- Alert sulla dashboard per documenti in scadenza
- Notifiche email prima della scadenza
- Badge colorati per indicare lo stato (verde = valido, giallo = in scadenza, rosso = scaduto)
