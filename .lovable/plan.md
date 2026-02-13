

# Piano: Aggiungere Gestione Persone nel Tab Team (Super Admin)

## Panoramica

Attualmente il tab "Team" nella pagina dettaglio azienda mostra solo i dati in sola lettura. Il Super Admin deve poter aggiungere Staff, Venditori e Dipendenti direttamente da questa vista, senza dover usare l'impersonificazione.

---

## Cosa cambia

Per ogni sezione del tab Team (Staff, Venditori, Dipendenti), aggiungere un bottone "Aggiungi" nell'header della Card che apre il dialog di creazione corrispondente. Le edge function e i dialog esistenti verranno riutilizzati.

### Sezione Staff
- Bottone "Nuovo Staff" nell'header della card Staff
- Riutilizza `StaffUserDialog` (gia esistente)
- Chiama la edge function `create-company-staff` passando il `company_id` dell'azienda corrente
- Mostra la password temporanea dopo la creazione
- Aggiungere bottone "Permessi" per gestire i permessi dello staff creato (riutilizza `PermissionsDialog`)

### Sezione Venditori
- Bottone "Nuovo Venditore" nell'header della card Venditori
- Riutilizza `SalespersonDialog` (gia esistente)
- Insert diretto nella tabella `salespeople` con il `company_id` dell'azienda
- Possibilita di creare account (bottone "Crea Account" nella riga, chiama `create-salesperson-user`)

### Sezione Dipendenti
- Bottone "Nuovo Dipendente" nell'header della card Dipendenti
- Riutilizza `EmployeeDialog` (gia esistente)
- Insert diretto nella tabella `employees` con il `company_id` dell'azienda
- Possibilita di creare account (bottone "Crea Account" nella riga, chiama `create-employee-user`)

---

## File da Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/pages/admin/CompanyDetail.tsx` | Modifica | Aggiungere bottoni "Aggiungi", dialog, mutation per Staff/Venditori/Dipendenti + gestione permessi |

Nessun nuovo file, nessuna migrazione DB, nessuna nuova edge function. Tutto il backend necessario esiste gia.

---

## Dettagli Tecnici

### Nuovi state nel componente

```text
- createStaffOpen (boolean) - dialog creazione staff
- createSalespersonOpen (boolean) - dialog creazione venditore
- editingSalesperson (Salesperson | null) - per SalespersonDialog
- createEmployeeOpen (boolean) - dialog creazione dipendente
- editingEmployee (Employee | null) - per EmployeeDialog
- permissionsUser (StaffUser | null) - dialog permessi staff
- accountDialog (open, type, entity) - dialog creazione account
- passwordDialog (open, password, name) - mostra password temporanea
```

### Nuove mutation

1. **createStaffMutation**: chiama `create-company-staff` edge function con `company_id` = `id` (dall'URL)
2. **createSalespersonMutation**: insert in `salespeople` con `company_id` = `id`
3. **createEmployeeMutation**: insert in `employees` con `company_id` = `id`
4. **createAccountMutation**: chiama edge function `create-employee-user` o `create-salesperson-user`
5. **savePermissionsMutation**: update `staff_permissions` per lo staff selezionato

Tutte le mutation invalidano la query `["company-team", id]` al successo.

### UI - Bottoni nell'header di ogni Card

Ogni sezione Team avra un bottone "+" nell'header:

```text
<CardHeader>
  <div className="flex items-center gap-2">
    <Icon />
    <CardTitle>Titolo</CardTitle>
    <Badge className="ml-auto">N</Badge>
    <Button size="sm" onClick={...}>
      <Plus /> Aggiungi
    </Button>
  </div>
</CardHeader>
```

### UI - Colonna Azioni nelle tabelle

Aggiungere una colonna "Azioni" con:
- Staff: bottone Permessi (icona Shield)
- Venditori: bottone "Crea Account" se `user_id` e null
- Dipendenti: bottone "Crea Account" se `user_id` e null

### Import aggiuntivi

```text
import { StaffUserDialog, StaffUserFormData } from "@/components/users/StaffUserDialog";
import { PermissionsDialog, StaffPermissions } from "@/components/users/PermissionsDialog";
import { SalespersonDialog } from "@/components/salespeople/SalespersonDialog";
import { EmployeeDialog, EmployeeFormData } from "@/components/employees/EmployeeDialog";
```

