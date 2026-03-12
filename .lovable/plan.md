

# Piano: Admin Settings GHL-Style Sidebar Enhancement

## Stato attuale

La pagina Admin Settings ha **gia** un layout sidebar GHL-style in `AdminLayout.tsx` (funzione `AdminSettingsSidebar`, linee 138-262) con:
- Routing URL-based (`/admin/impostazioni/profilo`, `/admin/impostazioni/email`, ecc.)
- Gruppi (Account, Piattaforma, Amministrazione)
- Icone + label per ogni voce
- Permessi condizionali per sezioni admin

**Cosa manca** rispetto al prompt:
1. **Nessuna descrizione** sotto le voci di navigazione
2. **Nessuna ricerca** rapida nelle impostazioni
3. **Nessun file di configurazione centralizzato** — le voci sono hardcoded nell'AdminLayout
4. **Mancano alcune voci** richieste (Sicurezza, Feature Flags)
5. Il vecchio `AdminSettings.tsx` con Tabs e' ancora presente (ma inutilizzato — il router redirige a `/admin/impostazioni/profilo`)

## Implementazione

### 1. Creare `src/config/adminSettingsNav.ts`
Configurazione centralizzata delle voci di navigazione con `id`, `label`, `description`, `icon`, `permission`, `badge`. Le voci corrisponderanno alle rotte gia esistenti in `adminRoutes.tsx` piu le nuove (sicurezza, feature-flags). Includere tutte le voci attuali: Profilo, Piattaforma, Notifiche, Email, Agenti AI, Super Admin, Registro Attivita, IP Allowlist + nuove: Sicurezza, Feature Flags.

### 2. Riscrivere `AdminSettingsSidebar` in `AdminLayout.tsx`
Sostituire la funzione `AdminSettingsSidebar` (linee 138-262) per:
- Leggere le voci da `adminSettingsNav.ts` invece di hardcodarle
- Aggiungere **descrizione** sotto ogni label (testo piccolo grigio)
- Aggiungere **campo di ricerca** con filtro live su label e description
- Aggiungere **badge** opzionale (es. "Nuovo" su Feature Flags)
- Mantenere il pattern NavLink con `activeClassName` gia in uso

### 3. Creare stub `SecurityTab.tsx` e `FeatureFlagsTab.tsx`
Due componenti placeholder minimi per le nuove sezioni.

### 4. Aggiungere rotte mancanti in `adminRoutes.tsx`
- `/admin/impostazioni/sicurezza` → SecurityTab wrapper
- Rimuovere il vecchio `AdminSettings.tsx` (non piu usato)

### File impattati
| File | Azione |
|---|---|
| `src/config/adminSettingsNav.ts` | Nuovo — config centralizzata |
| `src/components/layouts/AdminLayout.tsx` | Riscrivere `AdminSettingsSidebar` (~120 righe) |
| `src/components/admin/settings/SecurityTab.tsx` | Nuovo — stub |
| `src/components/admin/settings/FeatureFlagsTab.tsx` | Nuovo — stub |
| `src/pages/admin/settings/AdminSettingsSecurity.tsx` | Nuovo — wrapper pagina |
| `src/routes/adminRoutes.tsx` | Aggiungere rotta sicurezza |

