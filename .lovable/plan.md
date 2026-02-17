
# Espansione Sezione Impostazioni Super Admin

## Situazione attuale
La pagina `/admin/impostazioni` ha solo 2 card: Profilo e Cambio Password. Per un pannello Super Admin mancano funzionalita chiave di gestione piattaforma.

## Interventi

### 1. Layout a Tab (come la sezione azienda)
Trasformare la pagina da layout a 2 colonne a layout con **Tabs**, con le seguenti sezioni:

| Tab | Icona | Contenuto |
|-----|-------|-----------|
| Profilo | User | Card profilo + card cambio password (contenuto esistente riorganizzato) |
| Super Admin | ShieldCheck | Lista utenti super admin, creazione nuovo super admin |
| Piattaforma | Server | Statistiche piattaforma (totale aziende, utenti, ordini), info versione |
| Notifiche | Bell | Preferenze notifiche email (es. alert trial in scadenza, nuove iscrizioni) -- struttura predisposta |

### 2. Tab "Super Admin" -- Gestione utenti admin
- **Lista**: mostra tutti gli utenti con ruolo `super_admin` (query su `user_roles` + `profiles`)
- **Creazione**: dialog per creare un nuovo Super Admin (nome, cognome, email, password)
- **Rimozione**: possibilita di rimuovere un super admin (con protezione: non puoi eliminare te stesso ne l'ultimo admin rimasto)
- Richiede una **nuova edge function** `manage-super-admins` che supporti:
  - `action: "list"` -- lista tutti i super admin
  - `action: "create"` -- crea un nuovo super admin (come `create-super-admin` ma senza il blocco "gia esistente")
  - `action: "delete"` -- rimuove un super admin (con validazioni)

### 3. Tab "Piattaforma" -- Info e statistiche
Card di sola lettura con:
- **Totale aziende** registrate
- **Totale utenti** sulla piattaforma
- **Totale ordini** nel sistema
- **Versione piattaforma** (stringa statica)
- **URL progetto** e **Anon Key** (read-only, copiabili con click) per integrazioni API

### 4. Tab "Notifiche" -- Preferenze (predisposizione)
Card con switch per preferenze future:
- Notifica nuova azienda registrata
- Notifica trial in scadenza
- Notifica nuovo ticket di supporto

Questi switch saranno solo UI per ora (salvati in localStorage), predisposti per un futuro collegamento a una tabella `admin_preferences`.

## Dettaglio tecnico

### Nuova Edge Function: `supabase/functions/manage-super-admins/index.ts`
- Autenticazione: verifica che il chiamante sia un super_admin attivo (tramite service role + check su `user_roles`)
- `action: "list"`: query `user_roles` WHERE role = 'super_admin', join con `profiles`
- `action: "create"`: crea utente auth, profilo e ruolo (come `create-super-admin` ma senza il check "gia esiste")
- `action: "delete"`: verifica che non sia l'ultimo admin, poi elimina ruolo, profilo e utente auth

### Nuovi componenti
| File | Descrizione |
|------|-------------|
| `src/components/admin/settings/SuperAdminUsersTab.tsx` | Lista + CRUD super admin |
| `src/components/admin/settings/PlatformInfoTab.tsx` | Statistiche e info piattaforma |
| `src/components/admin/settings/NotificationsTab.tsx` | Preferenze notifiche |
| `src/components/admin/settings/CreateSuperAdminDialog.tsx` | Dialog creazione nuovo super admin |

### File modificati
| File | Modifica |
|------|----------|
| `src/pages/admin/AdminSettings.tsx` | Ristrutturazione completa con Tabs, contenuto esistente spostato nel tab "Profilo" |
| `supabase/config.toml` | Aggiunta configurazione `manage-super-admins` con `verify_jwt = false` |

### Configurazione database
- Nessuna nuova tabella necessaria: i super admin sono gia gestiti tramite `user_roles` + `profiles`
- Le query di conteggio per la tab Piattaforma usano le tabelle esistenti (`companies`, `profiles`, `orders`)

## Cosa rimane invariato
- Tutto il contenuto esistente del tab Profilo (form profilo, cambio password con verifica, strength indicator, toggle visibilita)
- Sidebar e routing Admin
- Logica di autenticazione e ruoli
