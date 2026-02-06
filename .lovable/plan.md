
# Piano: Ottimizzazione Area Super Admin

## Stato Attuale Analizzato

### Cosa esiste gia:
1. **Dashboard** (`AdminDashboard.tsx`): Mostra statistiche base (aziende, ordini, clienti)
2. **Lista Aziende** (`CompaniesList.tsx`): Visualizza aziende con ricerca e impersonation
3. **Crea Azienda** (`CreateCompany.tsx`): Form completo per creare aziende
4. **Layout** (`AdminLayout.tsx`): Sidebar con solo 2 voci (Dashboard, Aziende)

### Cosa manca:
1. **Nessuna visibilita sui ticket di supporto** - Il super admin non puo vedere le richieste di assistenza globali
2. **Nessun modo di modificare/eliminare aziende** - Solo creazione disponibile
3. **Dashboard poco informativa** - Mancano grafici, trend, e dettagli recenti
4. **Nessuna visione degli ordini globali** - Non puo vedere tutti gli ordini della piattaforma
5. **Sidebar minimale** - Solo 2 voci di navigazione
6. **Manca profilo Super Admin** - Nessuna pagina per gestire il proprio account
7. **Nessun log di attivita** - Non traccia le azioni effettuate

---

## Implementazione Proposta

### FASE 1: Miglioramento Dashboard

Trasformare la dashboard in un pannello di controllo completo:

```
+--------------------------------------------------+
|  Dashboard Super Admin                           |
+--------------------------------------------------+
|                                                  |
|  [4 STAT CARDS con tendenze]                     |
|  - Aziende attive (+ nuove questa settimana)     |
|  - Ordini totali (+ valore complessivo in EUR)   |
|  - Clienti totali                                |
|  - Ticket aperti (con indicatore urgenza)        |
|                                                  |
+--------------------------------------------------+
|                     |                            |
|  AZIENDE RECENTI    |    ATTIVITA RECENTE        |
|  (ultime 5)         |    (ultimi ordini/ticket)  |
|  [Card azienda]     |    [Timeline attivita]     |
|  [Card azienda]     |                            |
|  ...                |                            |
|                     |                            |
+--------------------------------------------------+
```

**Nuove metriche:**
- Valore totale ordini piattaforma
- Numero ticket in attesa
- Aziende aggiunte questo mese
- Grafico trend ordini ultimi 7 giorni (opzionale)

---

### FASE 2: Nuove Pagine Admin

#### 2.1 Pagina Ordini Globali (`/admin/ordini`)
Visualizza tutti gli ordini di tutte le aziende con:
- Filtro per azienda
- Filtro per stato
- Ricerca per descrizione/cliente
- Link rapido per impersonare l'azienda e vedere dettagli

#### 2.2 Pagina Ticket Globali (`/admin/ticket`)
Visualizza tutti i ticket di supporto con:
- Filtro per azienda
- Filtro per stato (aperto, in lavorazione, risolto)
- Ordinamento per data/urgenza
- Possibilita di rispondere direttamente o impersonare

#### 2.3 Pagina Dettaglio Azienda (`/admin/aziende/:id`)
Scheda completa dell'azienda con:
- Informazioni azienda (nome, email, settore, logo)
- Statistiche specifiche (ordini, clienti, ticket)
- Lista admin azienda
- Azioni: Modifica, Disattiva, Impersona

#### 2.4 Pagina Modifica Azienda (`/admin/aziende/:id/modifica`)
Form per modificare:
- Nome azienda
- Email
- Settore
- Logo

---

### FASE 3: Aggiornamento Sidebar

Nuova struttura navigazione:

```
+---------------------------+
|  [Logo EdiliziaInCloud]   |
+---------------------------+
|  NAVIGAZIONE              |
|  > Dashboard              |
|  > Aziende                |
|  > Ordini                 |  <- NUOVO
|  > Ticket                 |  <- NUOVO
+---------------------------+
|  ACCOUNT                  |
|  > Impostazioni           |  <- NUOVO
+---------------------------+
|  [Avatar + Nome]          |
|  Super Admin              |
|  [Logout]                 |
+---------------------------+
```

---

### FASE 4: Pagina Impostazioni Admin (`/admin/impostazioni`)

Permette al super admin di:
- Visualizzare il proprio profilo
- Modificare nome/cognome
- Cambiare password (opzionale)

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/pages/admin/AdminDashboard.tsx` | Modificare | Dashboard arricchita con piu statistiche e attivita recente |
| `src/pages/admin/GlobalOrders.tsx` | Creare | Lista ordini globali con filtri |
| `src/pages/admin/GlobalTickets.tsx` | Creare | Lista ticket globali con filtri |
| `src/pages/admin/CompanyDetail.tsx` | Creare | Dettaglio singola azienda |
| `src/pages/admin/EditCompany.tsx` | Creare | Form modifica azienda |
| `src/pages/admin/AdminSettings.tsx` | Creare | Impostazioni account super admin |
| `src/components/layouts/AdminLayout.tsx` | Modificare | Aggiungere nuove voci sidebar |
| `src/App.tsx` | Modificare | Aggiungere nuove routes |

---

## Dettagli Implementativi

### Dashboard Migliorata

```tsx
// Nuove statistiche
const stats = {
  totalCompanies: number,
  companiesThisMonth: number,   // NUOVO
  totalOrders: number,
  totalOrdersValue: number,     // NUOVO - somma total_amount
  totalCustomers: number,
  openTickets: number,          // NUOVO
}

// Sezione attivita recente
<Card>
  <CardHeader>Attivita Recente</CardHeader>
  <CardContent>
    {/* Ultimi ordini creati */}
    {/* Ultimi ticket aperti */}
    {/* Ultime aziende create */}
  </CardContent>
</Card>
```

### Ordini Globali

```tsx
// Query per ordini globali
const { data } = await supabase
  .from("orders")
  .select(`
    *,
    company:companies(name, logo_url),
    customer:profiles!orders_customer_id_fkey(first_name, last_name),
    status:order_statuses(name, color)
  `)
  .order("created_at", { ascending: false });
```

### Ticket Globali

```tsx
// Query per ticket globali  
const { data } = await supabase
  .from("tickets")
  .select(`
    *,
    company:companies(name),
    customer:profiles!tickets_customer_id_fkey(first_name, last_name, email)
  `)
  .order("created_at", { ascending: false });
```

### Nuove Routes

```tsx
// In App.tsx, sotto le routes admin esistenti
<Route path="ordini" element={<GlobalOrders />} />
<Route path="ticket" element={<GlobalTickets />} />
<Route path="aziende/:id" element={<CompanyDetail />} />
<Route path="aziende/:id/modifica" element={<EditCompany />} />
<Route path="impostazioni" element={<AdminSettings />} />
```

---

## Priorita Implementazione

1. **Alta**: Dashboard migliorata + Sidebar aggiornata
2. **Alta**: Pagina Ordini Globali
3. **Alta**: Pagina Ticket Globali
4. **Media**: Dettaglio Azienda + Modifica
5. **Bassa**: Impostazioni Admin

---

## Risultato Atteso

1. Super Admin ha visibilita completa su tutta la piattaforma
2. Puo monitorare ordini e ticket senza dover impersonare ogni azienda
3. Dashboard informativa con metriche chiave
4. Navigazione completa e intuitiva
5. Possibilita di gestire le aziende (visualizzare, modificare)
