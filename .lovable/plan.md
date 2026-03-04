

# Segmentazione Utenti: 4 Categorie

## Stato attuale

La pagina utenti mostra solo 2 tipi: Admin e Operatori (`company_admin`/`company_staff`). I venditori vengono creati separatamente dalla sezione Team con la edge function `create-salesperson-user` che assegna il ruolo `salesperson` + `company_staff`. Il ruolo `call_center` non esiste nel database.

Il `call_center_id` su contatti/opportunita punta a profili generici (staff), senza un ruolo dedicato.

## Piano interventi

### 1. DB: Aggiungere ruolo `call_center` all'enum `app_role`

Migrazione SQL:
```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'call_center';
```

### 2. TypeScript: Aggiornare tipo `AppRole`

In `src/types/auth.ts`, aggiungere `"call_center"` all'union type.

### 3. Edge Function `create-company-staff`: Supportare 4 ruoli

Attualmente la funzione accetta solo `company_admin` o `company_staff`. Va estesa per accettare anche `salesperson` e `call_center`:
- Se `role_type` e `salesperson`: assegna ruolo `salesperson` + `company_staff` (come fa gia `create-salesperson-user`) + crea staff_permissions
- Se `role_type` e `call_center`: assegna ruolo `call_center` + `company_staff` + crea staff_permissions
- Per `salesperson`, creare anche il record nella tabella `salespeople` (collegato all'user)

### 4. UI: `UsersConfig.tsx` - 5 KPI cards + filtro esteso

Determinare il "tipo effettivo" di ogni utente guardando TUTTI i suoi ruoli:
- Ha ruolo `company_admin` → Amministratore
- Ha ruolo `salesperson` → Venditore
- Ha ruolo `call_center` → Call Center
- Ha solo `company_staff` → Operatore

KPI Cards: Totale | Amministratori | Operatori | Venditori | Call Center

Filtro ruolo: aggiungere "Venditori" e "Call Center" alle opzioni del Select.

Badge ruolo: icone e colori distinti per ogni tipo.

### 5. UI: `StaffUserDialog.tsx` - 4 tipi di utente

Aggiungere 2 bottoni extra nella selezione ruolo:
- Venditore (icona vendite, descrizione "Accesso vendite e provvigioni")
- Call Center (icona telefono, descrizione "Gestione contatti e opportunita")

I permessi sono configurabili solo per `company_staff`, `salesperson` e `call_center`. Admin ha accesso completo.

### 6. `has_permission` DB function

Attualmente controlla solo `company_staff`. Va estesa per controllare anche `salesperson` e `call_center` (entrambi usano la tabella `staff_permissions` tramite il dual-role `company_staff`). Nessuna modifica necessaria dato che entrambi i nuovi ruoli ricevono anche `company_staff`.

## File da modificare

- **DB migration**: Aggiungere `call_center` all'enum
- `src/types/auth.ts` - Aggiungere `call_center`
- `supabase/functions/create-company-staff/index.ts` - Supportare 4 ruoli
- `src/components/settings/UsersConfig.tsx` - 5 KPI, filtri, badge per 4 tipi
- `src/components/users/StaffUserDialog.tsx` - 4 opzioni ruolo nella creazione

