
# Gestione Ruoli Utente: Admin vs Staff con Visibilita Limitata

## Situazione Attuale

Analizzando il codice, ho trovato queste lacune:

1. **Creazione utente**: il dialog crea SOLO utenti `company_staff`. Non c'e scelta tra Admin e Staff.
2. **Utenti Staff**: vedono TUTTI i dati dell'azienda (ordini, attivita, appuntamenti) filtrati solo per `company_id`, non per assegnazione personale.
3. **Ordini**: non hanno un campo `assigned_to` per assegnare un ordine a un utente staff specifico.
4. **Admin aggiuntivi**: non e possibile creare altri utenti `company_admin`.

## Piano di Implementazione

### Fase 1 - Scelta Ruolo nella Creazione Utente

Modificare `StaffUserDialog.tsx` per aggiungere un selettore "Tipo utente":
- **Amministratore** (company_admin): accesso completo, puo creare altri utenti
- **Operatore** (company_staff): accesso limitato ai permessi configurati

Aggiornare la Edge Function `create-company-staff` per accettare un parametro `role_type` ("company_admin" o "company_staff"). Se admin, non creare il record `staff_permissions`. Se staff, creare i permessi come oggi.

### Fase 2 - Visualizzare Admin e Staff insieme

Aggiornare `UsersConfig.tsx` per:
- Caricare sia utenti `company_admin` che `company_staff` (escluso l'admin principale che si sta usando)
- Mostrare un badge "Admin" o "Staff" accanto a ogni utente
- Nascondere il pulsante permessi per gli admin (hanno gia accesso a tutto)
- Permettere la cancellazione di admin secondari

### Fase 3 - Campo `assigned_to` sugli Ordini

Aggiungere colonna `assigned_to UUID REFERENCES profiles(id)` alla tabella `orders` tramite migrazione SQL. Questo permette di assegnare ordini a utenti specifici.

### Fase 4 - Visibilita Limitata per Staff

Aggiungere un flag `only_assigned` (boolean, default false) alla tabella `staff_permissions`. Quando attivo, lo staff vede solo:

- **Ordini**: dove `assigned_to = user_id`
- **Attivita**: dove `assigned_to = user_id`
- **Appuntamenti**: dove `assigned_to = user_id`

Implementazione lato frontend:
- Nel hook di caricamento ordini, aggiungere filtro `.eq("assigned_to", user.id)` se il permesso `only_assigned` e attivo
- Stessa logica per attivita e appuntamenti
- Aggiungere il campo "Assegnato a" nel form ordine (select con lista utenti staff/admin)

Aggiornare `PermissionsDialog.tsx` per includere il toggle "Mostra solo elementi assegnati".

### Fase 5 - Protezione RLS

Aggiornare le policy RLS per gli staff:
- Ordini: aggiungere policy che permette allo staff di vedere solo ordini assegnati (se `only_assigned = true`)
- Attivita e Appuntamenti: stessa logica

Creare una nuova funzione database `is_assigned_or_full_access(user_id, record_assigned_to)` che ritorna true se l'utente ha accesso completo oppure se il record e assegnato a lui.

### Fase 6 - Selettore "Assegnato a" nel Form Ordine

Aggiungere un campo select in `CreateOrder.tsx` e `EditOrder.tsx` per scegliere a chi assegnare l'ordine. La lista mostra tutti gli utenti admin e staff dell'azienda.

---

## Dettagli Tecnici

### Migrazione Database

```text
-- Colonna assigned_to su orders
ALTER TABLE orders ADD COLUMN assigned_to UUID REFERENCES profiles(id);

-- Flag only_assigned su staff_permissions
ALTER TABLE staff_permissions ADD COLUMN only_assigned BOOLEAN DEFAULT false;

-- Funzione helper per visibilita
CREATE FUNCTION check_staff_visibility(user_id, assigned_to) ...
```

### File da Modificare

| File | Modifica |
|------|----------|
| `StaffUserDialog.tsx` | Aggiunta selettore ruolo (Admin/Staff) |
| `create-company-staff/index.ts` | Supporto parametro `role_type` |
| `UsersConfig.tsx` | Caricamento admin + staff, badge ruolo |
| `PermissionsDialog.tsx` | Toggle "Solo elementi assegnati" |
| `usePermissions.ts` | Esporre flag `onlyAssigned` |
| `OrdersList.tsx` | Filtro per assegnazione |
| `Tasks.tsx` | Filtro per assegnazione |
| `CreateOrder.tsx` / `EditOrder.tsx` | Campo "Assegnato a" |
| `CompanyLayout.tsx` | Nessuna modifica (gia filtra per permessi) |

### Ordine di Esecuzione

1. Migrazione DB (colonne + funzioni)
2. Edge Function aggiornata
3. Dialog creazione con scelta ruolo
4. Lista utenti con badge
5. Toggle "solo assegnati" nei permessi
6. Campo assegnazione ordini
7. Filtri frontend per visibilita limitata
