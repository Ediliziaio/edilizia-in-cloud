

# Miglioramento Creazione Account per Venditori e Staff/Operai

## Panoramica
Quando si crea un account per un venditore o un dipendente (operaio/staff interno), il sistema deve:
1. Creare anche un record nella sezione "Utenti" (con ruolo `company_staff`) cosi che la persona sia assegnabile
2. Permettere di configurare i permessi granulari (divisi ora in Gestione Interna e Marketing e Vendita)
3. Aggiungere il campo cellulare nel dialog di creazione account
4. Permettere di inserire una password manuale (se inserita, l'utente entra con quella; se lasciata vuota, viene generata automaticamente e mostrata)

## Cosa cambia

### 1. Dialog "Crea Account" per Venditori (`SalespeopleConfig.tsx`)
Attualmente il dialog chiede solo l'email. Va esteso con:
- Campo **Cellulare** (opzionale)
- Campo **Password** (opzionale) con spiegazione: "Se lasci vuoto, verra generata automaticamente"
- Sezione **Permessi** inline (stessa UI gia presente in `StaffUserDialog.tsx`) con le sezioni aggiornate

### 2. Dialog "Crea Account" per Dipendenti (`Employees.tsx`)
Stesso miglioramento del dialog venditori:
- Campo **Cellulare** (opzionale)
- Campo **Password** (opzionale)
- Sezione **Permessi** inline

### 3. Edge Function `create-salesperson-user`
Modificare per:
- Accettare parametro opzionale `password` (se fornito, usare quella invece di generarne una)
- Accettare parametro opzionale `phone`
- Creare anche un record `staff_permissions` per l'utente
- Assegnare ruolo `company_staff` IN AGGIUNTA al ruolo `salesperson` (cosi appare nella sezione Utenti)
- Accettare e salvare i `permissions` passati dal client

### 4. Edge Function `create-employee-user`
Modificare per:
- Accettare parametro opzionale `password`
- Accettare parametro opzionale `phone`
- Creare anche un record `staff_permissions` per l'utente
- Assegnare ruolo `company_staff` IN AGGIUNTA al ruolo `employee`
- Accettare e salvare i `permissions` passati dal client

### 5. Aggiornamento sezioni permessi
Sia nel `StaffUserDialog.tsx` che nel `PermissionsDialog.tsx`, le sezioni permessi vanno raggruppate in due categorie per riflettere la nuova organizzazione della sidebar:

**Gestione Interna:**
- Dashboard
- Ordini
- Magazzino
- Calendario
- Clienti
- Dipendenti
- Assistenza
- Previsionale
- Impostazioni

**Marketing e Vendita:**
- Contatti Marketing (nuovo permesso: `can_view_marketing`, `can_edit_marketing`)

Nota: per la fase attuale si mantengono i permessi esistenti raggruppandoli con label visive. L'aggiunta di nuovi permessi specifici per il marketing richiede una migrazione database (campo `can_view_marketing` nella tabella `staff_permissions`).

### 6. Migrazione Database
Aggiungere colonne alla tabella `staff_permissions`:
- `can_view_marketing` (boolean, default false)
- `can_edit_marketing` (boolean, default false)

## Dettaglio tecnico per file

| File | Azione |
|---|---|
| `src/components/settings/SalespeopleConfig.tsx` | Estendere dialog creazione account con cellulare, password e permessi |
| `src/pages/azienda/Employees.tsx` | Estendere dialog creazione account con cellulare, password e permessi |
| `supabase/functions/create-salesperson-user/index.ts` | Supporto password manuale, phone, permessi, doppio ruolo |
| `supabase/functions/create-employee-user/index.ts` | Supporto password manuale, phone, permessi, doppio ruolo |
| `src/components/users/StaffUserDialog.tsx` | Aggiornare sezioni permessi con raggruppamento + aggiungere can_view/edit_marketing |
| `src/components/users/PermissionsDialog.tsx` | Aggiornare sezioni permessi con raggruppamento + aggiungere can_view/edit_marketing |
| Migrazione SQL | Aggiungere `can_view_marketing`, `can_edit_marketing` a `staff_permissions` |

## Flusso utente risultante

1. Admin va in Venditori, clicca "Crea Account" su un venditore
2. Appare dialog con: Email (precompilata), Cellulare, Password (opzionale), Permessi
3. Se la password e inserita manualmente, l'utente entrera con quella
4. Se la password e lasciata vuota, viene generata e mostrata all'admin
5. L'utente creato appare automaticamente anche nella sezione "Utenti"
6. Stesso flusso per Operai e Staff Interno

## Cosa NON cambia
- La creazione utente dalla sezione "Utenti" resta invariata
- Il routing e la sidebar restano invariati
- La struttura delle tabelle `employees`, `salespeople`, `profiles` resta invariata

