

# Piano di Implementazione - Gestione Ordini Admin Azienda

## Panoramica

Implementeremo la pagina completa per la gestione degli ordini dell'admin azienda, inclusa la lista ordini con filtri, il form di creazione ordine e la visualizzazione dettaglio ordine con progress tracker interattivo.

---

## 1. Dashboard Super Admin - Statistiche

Le statistiche reali sono gia implementate correttamente nel file `AdminDashboard.tsx` (linee 18-40). La dashboard sta gia recuperando:
- Numero di aziende dalla tabella `companies`
- Numero di ordini dalla tabella `orders`  
- Numero di clienti dalla tabella `user_roles` filtrata per ruolo `customer`

Non sono necessarie modifiche.

---

## 2. Pagina Lista Ordini (Admin Azienda)

### File: `src/pages/azienda/OrdersList.tsx`

Creeremo una pagina con:
- Titolo e pulsante "Nuovo Ordine"
- Barra di ricerca per descrizione e cliente
- Filtri per stato ordine (dropdown)
- Tabella ordini con colonne:
  - Descrizione (troncata)
  - Cliente (nome + cognome)
  - Importo totale
  - Stato (badge colorato)
  - Data creazione
  - Azioni (visualizza/modifica)
- Paginazione
- Empty state quando non ci sono ordini

### Query Database
```text
SELECT 
  orders.*,
  profiles.first_name, profiles.last_name,
  order_statuses.name as status_name, 
  order_statuses.color as status_color
FROM orders
LEFT JOIN profiles ON orders.customer_id = profiles.id
LEFT JOIN order_statuses ON orders.current_status_id = order_statuses.id
WHERE orders.company_id = [company_id]
ORDER BY created_at DESC
```

---

## 3. Pagina Creazione Ordine

### File: `src/pages/azienda/CreateOrder.tsx`

Form con i seguenti campi:
- **Cliente** (dropdown con ricerca - lista clienti dell'azienda)
- **Descrizione lavoro** (textarea)
- **Importo totale** (input numerico con formattazione euro)
- **Importo acconto** (input numerico)
- **Importo saldo** (calcolato automaticamente: totale - acconto)
- **Data prevista consegna** (date picker)
- **Note interne** (textarea, opzionale)
- **Stato iniziale** (dropdown con stati dell'azienda - default primo stato)

### Logica
1. Salva ordine in tabella `orders`
2. Crea prima entry in `order_status_history` con stato iniziale
3. Redirect alla lista ordini con toast di conferma

---

## 4. Pagina Dettaglio Ordine

### File: `src/pages/azienda/OrderDetail.tsx`

Layout a due colonne:

**Colonna sinistra (2/3):**
- Card con descrizione ordine
- Progress tracker visivo interattivo (componente esistente)
- Storico cambi stato con timestamp e autore

**Colonna destra (1/3):**
- Card informazioni cliente (nome, email, telefono)
- Card riepilogo finanziario (totale, acconto, saldo)
- Card note interne (editabili)
- Pulsanti azione (modifica ordine, elimina)

### Progress Tracker Interattivo
- Admin puo cliccare sugli step per aggiornare lo stato
- Dialog di conferma prima del cambio stato
- Aggiornamento automatico di `orders.current_status_id`
- Nuova entry in `order_status_history`

---

## 5. File da Creare

```text
src/pages/azienda/OrdersList.tsx       - Lista ordini con filtri e tabella
src/pages/azienda/CreateOrder.tsx      - Form creazione nuovo ordine
src/pages/azienda/OrderDetail.tsx      - Visualizzazione dettaglio ordine
```

---

## 6. File da Modificare

```text
src/App.tsx - Aggiornare route ordini:
  - /azienda/ordini        -> OrdersList
  - /azienda/ordini/nuovo  -> CreateOrder
  - /azienda/ordini/:id    -> OrderDetail
```

---

## 7. Componenti UI Riutilizzati

- `OrderProgressTracker` - Gia implementato, usato con `interactive=true` per admin
- `Card`, `Table`, `Badge` - Componenti shadcn esistenti
- `Button`, `Input`, `Select`, `Textarea` - Form controls esistenti

---

## 8. Struttura OrdersList

```text
+------------------------------------------+
| Ordini                    [+ Nuovo Ordine]|
+------------------------------------------+
| [Cerca ordine...]  [Filtra per stato v]  |
+------------------------------------------+
| Descrizione | Cliente | Totale | Stato | Data |
|-------------|---------|--------|-------|------|
| Fornitura   | Mario   | €5,000 | [🔵]  | 1/2  |
| Lavoro di   | Luigi   | €3,200 | [🟢]  | 28/1 |
+------------------------------------------+
```

---

## 9. Flusso di Test

1. Accedere come admin azienda
2. Navigare a /azienda/ordini - verificare lista vuota con empty state
3. Cliccare "Nuovo Ordine" - compilare form
4. Verificare ordine creato nella lista
5. Cliccare su ordine per vedere dettaglio
6. Testare cambio stato tramite progress tracker
7. Verificare aggiornamento in lista

