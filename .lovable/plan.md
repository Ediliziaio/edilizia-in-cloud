

# Cron 5min + Pagina SuperAdmin Sync Logs

## Stato attuale
- La tabella `google_calendar_sync_log` esiste già nel database
- La funzione `cronFullSync()` nell'edge function scrive già l'audit trail
- Il cron job è schedulato a 15 minuti — va rischedulato a 5

## Modifiche

### 1. Reschedule cron job a 5 minuti
SQL insert (non migration) per rimuovere il vecchio job e crearne uno nuovo con `*/5 * * * *`.

### 2. Nuova pagina: `src/pages/admin/SyncLogs.tsx`
Pagina SuperAdmin che mostra i log dalla tabella `google_calendar_sync_log`:
- Tabella con colonne: Data avvio, Durata, Stato, Connessioni trovate/sincronizzate/fallite, Errore
- Filtri: selezione stato (all/running/completed/failed) + date range (ultimo giorno/settimana/mese)
- Badge colorati per stato (running=giallo, completed=verde, failed=rosso)
- Espansione riga per mostrare il JSON `results` con dettaglio per-utente
- Paginazione (ultime 50 esecuzioni)
- Bottone "Aggiorna" per refresh manuale

### 3. Route + navigazione
- Aggiungere lazy import e route `sync-logs` sotto `/admin` in `App.tsx`
- Aggiungere voce di menu nella sidebar admin (`AdminLayout.tsx`) con icona `RefreshCw` e permesso `can_view_platform_stats`

## File

| File | Azione |
|------|--------|
| SQL insert | Reschedule cron `*/5 * * * *` |
| `src/pages/admin/SyncLogs.tsx` | **Nuovo** — pagina log sync |
| `src/App.tsx` | **Modifica** — aggiungere lazy import + route |
| `src/components/layouts/AdminLayout.tsx` | **Modifica** — aggiungere voce navigazione |

