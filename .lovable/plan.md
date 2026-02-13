

# Piano: Miglioramento Previsionale Cassa + Sezione Costi Aziendali

## Analisi attuale

Il previsionale attuale copre:
- Entrate: pagamenti clienti (acconti, saldi) non ancora incassati
- Uscite: squadre esterne non pagate, provvigioni venditori, materiali da ordinare

**Mancanze dal punto di vista di un direttore finanziario**:
- Nessuna gestione dei costi fissi ricorrenti (affitto, utenze, leasing, assicurazioni)
- Nessuna gestione dei costi variabili generali (non legati a singoli ordini)
- Nessun tracking dello stato di pagamento dei costi
- Il grafico non include i costi fissi/variabili nelle proiezioni
- Le KPI card non tengono conto dei costi strutturali

---

## 1. Nuova tabella `company_costs`

Campi:
- `id` (uuid, PK)
- `company_id` (uuid, FK)
- `name` (text) - es. "Affitto ufficio", "Utenze", "Carburante"
- `cost_type` (text) - "fixed" o "variable"
- `amount` (numeric) - importo
- `recurrence` (text) - "once", "monthly", "quarterly", "yearly"
- `due_date` (date) - data scadenza/pagamento
- `is_paid` (boolean, default false)
- `paid_date` (date, nullable)
- `category` (text, nullable) - es. "Affitto", "Utenze", "Trasporti", "Assicurazioni"
- `notes` (text, nullable)
- `order_id` (uuid, nullable) - se collegato a un ordine (per costi variabili)
- `created_at`, `updated_at`

**RLS**: company_admin puo gestire (ALL) dove `company_id = get_user_company_id(auth.uid())`. Super admin ALL.

---

## 2. Nuovo componente `CompanyCostsManager`

File: `src/components/forecast/CompanyCostsManager.tsx`

Interfaccia con:
- **Tabs**: "Costi Fissi" / "Costi Variabili"
- **Tabella** per ogni tipo con colonne: Nome, Categoria, Importo, Ricorrenza, Scadenza, Stato (Pagato/Non Pagato)
- **Pulsante "Segna come pagato"** per ogni riga con conferma
- **Dialog** per aggiungere/modificare un costo con form:
  - Nome, Tipo (fisso/variabile), Importo, Categoria (select con opzioni comuni), Ricorrenza, Data scadenza, Note
  - Se variabile: possibilita di collegare a un ordine (opzionale)
- **Badge** colorati: verde "Pagato", rosso "Da pagare", arancione "In scadenza" (entro 7 giorni)
- **Riepilogo** in alto: Totale da pagare questo mese, Totale pagato questo mese

---

## 3. Miglioramenti al Previsionale (CashFlowForecast.tsx)

### 3a. KPI Cards migliorate
Aggiungere i costi fissi/variabili non pagati nei calcoli di:
- "Questo Mese" - include costi fissi del mese
- "Prossimo Mese" - proietta costi ricorrenti
- "Prossimi 3 Mesi" - proietta costi ricorrenti
- "Totale in Sospeso" - include tutti i costi non pagati

### 3b. Nuova sezione "Costi Aziendali"
Inserire la sezione tra le provvigioni e il grafico, con:
- Card dedicata con icona e colore (es. rosso/arancione)
- Riepilogo costi fissi da pagare e costi variabili da pagare
- Tabella con i costi in scadenza (prossimi 30 giorni)
- Pulsante per gestire i costi (apre il manager completo)

### 3c. Grafico aggiornato
Il grafico a barre includera i costi fissi/variabili nelle "Uscite" mensili, proiettando i costi ricorrenti nei mesi futuri.

### 3d. Tabella movimenti
Aggiungere i costi non pagati nella tabella dettaglio movimenti con badge "Costo Fisso" o "Costo Variabile".

---

## 4. Navigazione

Aggiungere un tab o sezione dedicata "Costi" accessibile dal Previsionale, oppure integrato direttamente nella stessa pagina come sezione espandibile.

---

## Riepilogo tecnico

| File | Modifica |
|------|----------|
| **Migrazione DB** | Tabella `company_costs` + RLS policies |
| `src/components/forecast/CompanyCostsManager.tsx` | Nuovo componente gestione costi fissi/variabili |
| `src/pages/azienda/CashFlowForecast.tsx` | Query costi, integrazione nei calcoli KPI, grafico, tabella movimenti, sezione costi |

