

## Analisi: cosa manca davvero

Dopo aver ispezionato il codice, ecco lo stato attuale:

| Feature | Stato | Note |
|---------|-------|------|
| **Dashboard Admin** | **GIA' COMPLETA** | 17+ widget draggabili, MRR, health, cohort, forecast, export |
| **Filtri Avanzati Aziende** | **GIA' COMPLETI** | Filtri per stato, settore, piano, health + 4 preset smart + ordinamento colonne |
| **Tab Team/Utenti** | **Parziale** | 4 sezioni (Admin/Staff/Venditori/Dipendenti) con tabelle, ma manca: ricerca, ultimo accesso, eliminazione membri, modifica ruolo inline |
| **Azioni Contestuali** | **Mancante** | L'header ha solo "Accedi come Admin". Mancano: Modifica, Sospendi/Riattiva, Elimina, Export |

---

## Piano di implementazione

### 1. Azioni Contestuali nel Company Detail Header

Aggiungere un menu dropdown nell'header (`CompanyDetailHeader.tsx`) con:
- **Modifica** -- naviga al tab Dettagli in modalita' edit
- **Sospendi / Riattiva** -- toggle basato sullo stato corrente, con dialog di conferma
- **Elimina Azienda** -- AlertDialog con doppia conferma (digitare nome azienda)
- **Esporta Dati** -- export CSV dati azienda

L'header ricevera' nuove props: `onSuspend`, `onReactivate`, `onDelete`, `onEdit`, `isUpdatingStatus`.

Si usera' `DropdownMenu` con icone e separatori per raggruppare azioni safe vs destructive.

### 2. Potenziamento Tab Team

Migliorare `CompanyTeamTab.tsx` con:
- **Barra di ricerca** in-tab per filtrare membri per nome/email
- **Ultimo accesso** -- colonna con badge colorato (verde/giallo/rosso) usando i dati session_logs
- **Azioni per riga** -- menu dropdown con "Modifica permessi", "Resetta password", "Elimina utente"
- **Stat cards** compatte in cima (totale membri, attivi oggi, senza account)

Nuove props necessarie: `onDeleteUser`, `onResetPassword`, `lastAccessMap`.

---

### File modificati

- `src/components/admin/company/CompanyDetailHeader.tsx` -- dropdown azioni contestuali
- `src/components/admin/company/CompanyTeamTab.tsx` -- ricerca, ultimo accesso, azioni per riga
- `src/pages/admin/CompanyDetail.tsx` -- collegamento nuove props e handlers

