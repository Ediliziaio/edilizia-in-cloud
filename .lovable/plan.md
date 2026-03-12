

## Ripristino tab "Preventivi" nel popup Opportunità

La tab "Preventivi" è stata rimossa intenzionalmente in passato dal dialogo dettaglio opportunità, ma ora va ripristinata.

### Modifiche necessarie

**File: `src/components/opportunities/OpportunityDetailDialog.tsx`**

1. **Aggiungere `"quotes"` al tipo `Tab`** (riga 51):
   - Da: `"details" | "notes" | "appointments" | "activities" | "documents"`
   - A: `"details" | "notes" | "appointments" | "activities" | "documents" | "quotes"`

2. **Importare `OpportunityQuotesTab`** in cima al file

3. **Aggiungere la voce sidebar** nell'array `sidebarTabs` (riga 369-375), inserendo dopo "Documenti":
   - `{ key: "quotes", label: "Preventivi", icon: <FileText />, enabled: true }`

4. **Aggiungere il rendering del contenuto** dopo il blocco `tab === "documents"`, rendendo `OpportunityQuotesTab` con `contactId` e `companyId`

Nessuna modifica al database o ad altri file necessaria — il componente `OpportunityQuotesTab` esiste già e funziona.

