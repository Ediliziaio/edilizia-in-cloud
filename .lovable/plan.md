

# Analisi Sezione Dipendenti (Gestione Staff)

## Stato Generale: Funzionante, ben strutturato

La sezione comprende 10 file (1 pagina + 9 componenti): gestione operai e staff interno con CRUD completo, squadre esterne con IVA e referenti, rapportini ore con approvazione singola/batch, allegati documenti con scadenze, assegnazione dipendenti/squadre agli ordini. Tutto funzionante.

---

## DEAD CODE TROVATO

### 1. Import `Input` non utilizzato in EmployeeAttachments (Priorita: Bassa)
**File**: `src/components/employees/EmployeeAttachments.tsx` (riga 29)

Il componente `Input` e importato da `@/components/ui/input` ma non viene mai usato come componente JSX. Il file usa un elemento nativo `<input type="file">` (riga 303), non il componente `<Input>`.

**Fix**: Rimuovere `import { Input } from "@/components/ui/input";` dalla riga 29.

### 2. Forte duplicazione di codice tra EmployeeAttachments e ExternalTeamAttachments (Priorita: Media)
**File**: `src/components/employees/EmployeeAttachments.tsx` (510 righe) e `src/components/employees/ExternalTeamAttachments.tsx` (508 righe)

I due componenti condividono circa l'85% del codice: stessa logica di upload/download/delete, stesse costanti (`MAX_FILE_SIZE`, `ALLOWED_TYPES`), stesse funzioni helper (`formatFileSize`, `isExpired`, `isExpiringSoon`, `getFileIcon`, `resetUploadForm`, `handleFileChange`, `handleUpload`), stesso layout UI.

Le uniche differenze sono:
- Tabella database: `employee_attachments` vs `external_team_attachments`
- Campo FK: `employee_id` vs `external_team_id`
- Path storage: `employees/` vs `external-teams/`
- Tipi documento: `EMPLOYEE_DOCUMENT_TYPES` vs `EXTERNAL_TEAM_DOCUMENT_TYPES`
- Titolo dialog

**Nota**: Questo e un refactoring di media complessita. Lo segnalo per completezza ma non lo includo negli interventi immediati per mantenere il rischio basso. Si potra affrontare in un secondo momento creando un componente generico `PersonnelAttachments`.

---

## NESSUN BUG TROVATO

- Employees CRUD: insert con `role_type` corretto (operaio/staff_interno), update non sovrascrive `role_type`
- Filtro operai/staff interno: `employees.filter(e => e.role_type === ...)` coerente con i tab
- Stipendio: costo orario calcolato correttamente come `gross_salary / monthly_hours` (con guard `> 0`)
- ExternalTeamDialog: IVA selezionabile con `VAT_RATES`, default 22%
- WorkLogsAdminTab: `user` e correttamente usato per `approved_by` nelle mutation
- Batch approve: `supabase.update().in("id", logIds)` corretto
- Filtri rapportini: mese, dipendente, stato tutti funzionanti
- Costo stimato: somma `ore * costo_orario` per ogni log
- AssignEmployeeDialog: filtra dipendenti gia assegnati con `existingEmployeeIds`
- AssignExternalTeamDialog: eredita aliquota IVA dalla squadra selezionata
- Upload allegati: validazione tipo file e dimensione (10MB), sanitizzazione nome file
- Delete allegati: rimuove sia da storage che da database
- Alert scadenza documenti: calcolo corretto (scaduto vs in scadenza entro 30 giorni)
- Creazione account dipendente: usa edge function `create-employee-user` con password temporanea
- Tutti gli import sono utilizzati (tranne `Input` sopra indicato)

---

## RIEPILOGO INTERVENTI

| File | Intervento | Priorita |
|------|-----------|----------|
| `src/components/employees/EmployeeAttachments.tsx` | Rimuovere import `Input` non utilizzato | Bassa |

Nessun file da eliminare, nessun bug funzionale. La duplicazione EmployeeAttachments/ExternalTeamAttachments e segnalata come debito tecnico da affrontare in futuro.

