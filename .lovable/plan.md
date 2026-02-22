
# Fix Filtro Assegnazione in Appuntamenti, Attività e Automazioni

## Problema
Tre componenti caricano TUTTI i profili dell'azienda (inclusi clienti, dipendenti, venditori) nei selettori di assegnazione, invece di mostrare solo gli utenti aziendali (company_admin e company_staff).

## Componenti da correggere

### 1. AppointmentDialog.tsx (righe 91-103)
Query `assignable-users`: recupera tutti i profili con `company_id` senza filtrare per ruolo.

### 2. TaskDialog.tsx (righe 110-120)
Query `assignable-users`: stesso problema, prende tutti i profili.

### 3. AutomationDialog.tsx (righe 104-109)
Fetch utenti nella `useEffect`: prende tutti i profili senza filtrare.

## Soluzione
Applicare a tutti e 3 lo stesso pattern gia presente in `AssignedToSelect.tsx`:
1. Recuperare i profili con `company_id`
2. Recuperare i ruoli da `user_roles` per quegli utenti
3. Filtrare solo `company_admin` e `company_staff`
4. Restituire solo quei profili

## Componenti gia corretti (nessuna modifica necessaria)
- `AssignedToSelect.tsx` - usato negli ordini, gia filtra per ruolo
- `MarketingContactDetail.tsx` - appena corretto nel messaggio precedente

## Dettaglio tecnico

### File: `src/components/appointments/AppointmentDialog.tsx`
Modificare la query `assignable-users` (righe 93-100): dopo il fetch dei profili, fare una seconda query su `user_roles` e filtrare per `company_admin`/`company_staff`.

### File: `src/components/tasks/TaskDialog.tsx`
Modificare la query `assignable-users` (righe 112-119): stessa logica, aggiungere filtro per ruolo.

### File: `src/components/settings/AutomationDialog.tsx`
Modificare il fetch utenti nella `useEffect` (righe 104-109): dopo aver recuperato i profili, filtrare tramite `user_roles`.

## File coinvolti

| File | Azione |
|---|---|
| `src/components/appointments/AppointmentDialog.tsx` | Aggiungere filtro ruolo alla query assegnazione |
| `src/components/tasks/TaskDialog.tsx` | Aggiungere filtro ruolo alla query assegnazione |
| `src/components/settings/AutomationDialog.tsx` | Aggiungere filtro ruolo al fetch utenti |

## Cosa NON cambia
- Nessuna modifica al database
- Nessuna modifica al routing
- `AssignedToSelect.tsx` e `MarketingContactDetail.tsx` restano invariati
