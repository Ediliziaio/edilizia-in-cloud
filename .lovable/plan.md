
# Audit e Miglioramento Dashboard Super Admin

## Problemi Trovati

### 1. BUG: Mancanza gestione errore
La dashboard usa solo `isLoading` ma non `isError`. Se una query fallisce, la pagina resta bloccata sul loader o mostra dati vuoti senza feedback.

### 2. BUG: Query "Ticket Aperti" poco rilevante
La stat card "Ticket Aperti" conta i ticket dei clienti finali (tabella `tickets`), ma l'assistenza Super Admin usa `support_conversations`. Le due metriche sono disallineate: il Super Admin dovrebbe vedere le conversazioni di supporto aperte, non i ticket cliente.

### 3. BUG: Query `ordersValueRes` scarica TUTTI gli ordini
La query `supabase.from("orders").select("total_amount")` scarica tutti i record solo per sommare i valori. Questo diventa lento con migliaia di ordini. Meglio usare `count: "exact"` gia disponibile e calcolare il totale lato DB o usare una query piu leggera.

### 4. CODICE MORTO: AdminQuickActions ridondante
Il componente `AdminQuickActions` replica link gia presenti nella sidebar e nell'header ("Nuova Azienda", "Gestisci Aziende", "Gestisci Ticket"). Occupa spazio senza aggiungere valore.

### 5. MANCANZA: Nessuno stato di errore visuale
Nessun widget mostra un messaggio di errore o un tasto "Riprova" in caso di fallimento.

### 6. MANCANZA: Contatore supporto aperto
Non c'e visibilita sulle conversazioni di supporto aperte (`support_conversations` con status `open` o `in_progress`).

## Piano di Intervento

### File: `src/hooks/useAdminDashboardData.ts`
- Sostituire la query "tickets aperti" (`tickets` table) con una query su `support_conversations` dove `status NOT IN ('resolved', 'closed')` -- allineata al modulo assistenza Super Admin
- Aggiungere la query di conteggio supporto aperto nel `Promise.all`
- Rinominare `openTickets` in `openSupportConversations` per chiarezza
- Ottimizzare la query `ordersValueRes`: usare `.select("total_amount")` ma con `.limit(10000)` come guardia, oppure lasciare com'e visto che per un SaaS giovane i numeri sono gestibili (trade-off accettabile per ora)

### File: `src/components/admin/dashboard/AdminStatCards.tsx`
- Cambiare la card "Ticket Aperti" in "Supporto Aperto" con icona `MessageSquare` al posto di `AlertCircle`
- Aggiornare la descrizione da "Richieste in attesa" a "Conversazioni da gestire"
- Aggiornare l'interfaccia `AdminDashboardStats` per riflettere il nuovo campo

### File: `src/pages/admin/AdminDashboard.tsx`
- Aggiungere gestione `isError` con stato di errore visuale + tasto "Riprova" (`refetch`)
- Rimuovere il componente `AdminQuickActions` dal render (codice morto)
- Rimuovere l'import di `AdminQuickActions`
- Aggiornare il fallback di `stats` con il nuovo campo `openSupportConversations`

### File: `src/components/admin/dashboard/AdminQuickActions.tsx`
- Eliminare il file (non piu utilizzato)

### Riepilogo modifiche

| File | Azione |
|------|--------|
| `useAdminDashboardData.ts` | Fix query supporto, rinomina campo |
| `AdminStatCards.tsx` | Nuova label/icona per supporto |
| `AdminDashboard.tsx` | Stato errore, rimozione QuickActions |
| `AdminQuickActions.tsx` | Eliminazione file |

### Cosa rimane invariato (gia OK)
- MRR Chart con Recharts -- ben implementato
- Trial Funnel -- logica corretta
- Recent Companies con link navigabili
- Recent Activity con merge ordini/ticket ordinati per data
- `staleTime: 5 min` -- appropriato per dashboard admin
- `Promise.all` per parallelizzazione query -- gia ottimale
