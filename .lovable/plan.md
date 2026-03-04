

# Miglioramento Sezione Utenti - Stile GoHighLevel

## Analisi dello stato attuale

La sezione Utenti attuale (`UsersConfig.tsx`) e un semplice elenco tabellare con dialog modali per creazione e permessi. Manca completamente lo stile GHL con:
- Layout a pagina intera con sidebar sinistra di navigazione per il singolo utente
- Sezioni dedicate (Profilo, Ruoli & Autorizzazioni, Disponibilita, Calendario, Notifiche)
- Permessi modulari con toggle per categoria e checkbox granulari
- Gestione ruoli come entita separate

## Piano di implementazione

### Fase 1: Ristrutturare la pagina Utenti (lista)

**File: `src/components/settings/UsersConfig.tsx`**
- Aggiungere colonne: Avatar, Telefono, Ultimo accesso, Stato (attivo/disattivato)
- Aggiungere filtri: per ruolo, stato
- Aggiungere azioni rapide: Modifica, Reset password, Disattiva, Duplica permessi
- Click su utente apre pagina dettaglio (non dialog)

### Fase 2: Creare pagina dettaglio utente (stile GHL)

**Nuovo file: `src/pages/azienda/settings/SettingsUserDetail.tsx`**

Layout con sidebar sinistra e contenuto principale:

Sidebar tabs:
1. **Utente Informazioni** - Avatar, Nome, Cognome, Email, Telefono, Estensione, Firma email
2. **Ruoli & Autorizzazioni** - Selezione ruolo (Amministratore/Utente), permessi granulari per modulo con toggle categorie e checkbox individuali, opzione "Limita visibilita ai dati assegnati"
3. **Utente Disponibilita** - Ore lavorative settimanali (Lun-Dom), Ore specifiche per data, Fuso orario
4. **Calendario Configurazione** - Calendari collegati (Google Calendar), Videoconferenza
5. **Impostazioni Notifiche** - Matrice notifiche (Task, Calendario, Ordini, Lead) x canali (In-app, Email, SMS)

**Nuovi componenti:**
- `src/components/users/UserDetailLayout.tsx` - Layout con sidebar sinistra
- `src/components/users/UserProfileTab.tsx` - Tab profilo con avatar, campi, firma email
- `src/components/users/UserRolesPermissionsTab.tsx` - Permessi modulari stile GHL con collapsible per categoria
- `src/components/users/UserAvailabilityTab.tsx` - Orari settimanali, date specifiche
- `src/components/users/UserCalendarTab.tsx` - Calendari collegati
- `src/components/users/UserNotificationsTab.tsx` - Matrice notifiche

### Fase 3: Ristrutturare i permessi (stile GHL)

Il sistema permessi attuale ha solo view/edit per modulo. Lo espandiamo con UI migliorata:

**`UserRolesPermissionsTab.tsx`:**
- Select ruolo: Utente / Amministratore
- Checkbox "Limita visibilita ai dati assegnati"
- Barra ricerca moduli
- Categorie collapsible nella sidebar sinistra (come screenshot GHL):
  - Gestione Interna (con sotto-voci)
  - Marketing e Vendita (con sotto-voci)
  - Impostazioni Account
- Ogni modulo: toggle master + checkbox granulari (Visualizza, Crea, Modifica, Elimina)
- Bottone "Copia Autorizzazione" per duplicare permessi da altro utente

### Fase 4: Routing

**File: `src/App.tsx`**
- Aggiungere route: `/azienda/impostazioni/utenti/:userId` per il dettaglio utente

### Fase 5: Database (nessuna migrazione necessaria)

Le tabelle `staff_permissions` e `user_roles` esistono gia. I nuovi campi UI (disponibilita, notifiche) saranno aggiunti solo se necessario dopo la prima fase.

## Riepilogo componenti

```text
UsersConfig.tsx (lista migliorata)
  └─ click utente ─→ SettingsUserDetail.tsx
                        ├─ Sidebar navigazione
                        ├─ UserProfileTab
                        ├─ UserRolesPermissionsTab (GHL-style)
                        ├─ UserAvailabilityTab
                        ├─ UserCalendarTab
                        └─ UserNotificationsTab
```

## Note tecniche

- I permessi nel DB restano gli stessi (`staff_permissions`), la UI li presenta in modo piu strutturato
- Il layout segue lo stesso pattern delle screenshot GHL fornite: sidebar sinistra con tab, contenuto a destra
- La creazione utente resta come dialog dalla lista, ma con redirect al dettaglio dopo creazione
- Nessuna migrazione DB necessaria per la prima iterazione (i campi disponibilita/notifiche/calendario sono gia presenti o verranno gestiti in fase successiva)

