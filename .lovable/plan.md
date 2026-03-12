

# Piano: Super Admin Settings — Profilo & Sicurezza

## Stato attuale
- **ProfileTab**: funzionante ma senza avatar upload, usa `export default`, include anche il cambio password (che va spostato in SecurityTab)
- **SecurityTab**: stub placeholder con `export default`
- **profiles table**: NON ha colonna `avatar_url`
- **admin_sessions table**: non esiste
- Storage bucket per avatars: nessuno dedicato, useremo bucket esistente o ne creeremo uno

## Implementazione

### 1. DB Migration
- Aggiungere `avatar_url TEXT` alla tabella `profiles`
- Creare tabella `admin_sessions` (user_id, session_token UNIQUE, device_hint, ip_address, last_seen_at, created_at) con RLS (ogni admin vede solo le proprie) e indice su user_id
- Creare storage bucket `avatars` con policy pubblica per lettura

### 2. Riscrivere `ProfileTab.tsx`
Sostituire completamente con versione che include:
- Upload avatar con preview, validazione (immagine, max 2MB), upload su storage bucket `avatars` path `admin/{user_id}.ext`
- Card avatar con bottone cambia/rimuovi foto
- Card dati personali (nome, cognome, email read-only, badge ruolo Super Admin)
- Rimuovere la sezione cambio password (spostata in SecurityTab)
- Mantenere `export default` per compatibilita con i file che lo importano

### 3. Creare `src/hooks/useAdminSessions.ts`
- `useAdminSessions()`: query sulla tabella admin_sessions per l'utente corrente, ordinate per last_seen_at DESC, con flag `isCurrent` sulla prima
- `useRevokeSession()`: mutation per eliminare una sessione specifica

### 4. Riscrivere `SecurityTab.tsx`
Sostituire lo stub con versione completa che include:
- **PasswordCard**: cambio password con verifica password attuale (signInWithPassword), strength indicator a 5 livelli con barra segmentata, conferma password con check visivo
- **SessionsCard**: lista sessioni attive con device hint, IP, tempo relativo, badge "Sessione corrente", bottone revoca singola e "Revoca tutte le altre"
- Mantenere `export default`

### 5. Edge Function `upsert-admin-session`
- Verifica auth + ruolo super_admin
- Inserisce record in admin_sessions con session_token random, device_hint, ip_address
- Limita a max 5 sessioni per admin (elimina le piu vecchie)
- Aggiungere `verify_jwt = false` in config.toml

### 6. Aggiornare `AdminSettingsProfile.tsx`
Rimuovere header duplicato (titolo/descrizione) dato che il nuovo ProfileTab include gia il proprio header.

### File impattati
| File | Azione |
|---|---|
| DB migration | `avatar_url` su profiles + tabella `admin_sessions` + bucket storage |
| `src/components/admin/settings/ProfileTab.tsx` | Riscrittura completa |
| `src/components/admin/settings/SecurityTab.tsx` | Riscrittura completa |
| `src/hooks/useAdminSessions.ts` | Nuovo |
| `supabase/functions/upsert-admin-session/index.ts` | Nuovo |
| `src/pages/admin/settings/AdminSettingsProfile.tsx` | Semplificare wrapper |

