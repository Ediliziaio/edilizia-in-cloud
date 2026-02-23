

# Evoluzione Email Marketing - Allineamento GHL

L'implementazione attuale ha la struttura base (3 tab, CRUD campagne/template, funnel chart). Serve ora allineare la UI ai dettagli degli screenshot GHL e aggiungere le funzionalita mancanti.

---

## Modifiche

### 1. Tab Statistiche - `EmailStatsTab.tsx` (riscrittura)

Aggiungere gli elementi mancanti visibili nello screenshot GHL:

- **Barra filtri in alto**: selettore campagna ("Tutte le campagne"), date range picker (data inizio - data fine), label "Mostra risultati per", pulsante "+ Crea campagna"
- **Riepilogo del coinvolgimento**: titolo + sottotitolo descrittivo, grafico funnel orizzontale con percentuali a destra di ogni barra (100%, 0%, 0%, 0% come nello screenshot)
- **Analisi delle prestazioni**: 4 card (Email Consegna, Respinto, Annullato l'iscrizione, Reclami di spam) con valore numerico grande
- **Tasso di apertura**: card con valore grande + grafico a linee nel tempo (recharts LineChart), selettore metrica, legenda (Tutte le campagne, Campagna Email, Campagna Flusso, Campagna Azione in blocco)
- **Email con le migliori prestazioni**: tabella con colonne (Titolo, Data di esecuzione, Consegnato, Tasso di apertura, Tasso di clic, Tipo), toggle "Mostra statistiche in numeri", selettore ordinamento

Nuovo componente: `EmailPerformanceChart.tsx` (grafico a linee nel tempo)
Nuovo componente: `EmailTopCampaignsTable.tsx` (tabella migliori campagne)

### 2. Tab Campagne - `EmailCampaignsTab.tsx` (riscrittura)

Allineare alla struttura GHL con:

- **Layout a 2 colonne**: sidebar sinistra con sub-categorie (Campagne email, Campagne di flusso di..., Campagne Azione in...) + area principale destra
- **Header**: titolo "Campagne" + sottotitolo, pulsanti "Crea cartella" e "+ Nuovo", icona impostazioni
- **Toolbar**: toggle vista (cronologica / lista), campo ricerca, pulsante "Filtra"
- **Breadcrumb cartelle**: navigazione "Home" con breadcrumb
- **Tabella**: colonne (Titolo, Tipo, Ultimo aggiornamento, Data di esecuzione, Stato) con empty state centrato (icona email + "Nessuna campagna" + pulsante "+ Crea campagna")
- **Filtro per tipo**: campagna broadcast, flusso (automation), azione in blocco

### 3. Tab Modelli - `EmailTemplatesTab.tsx` (riscrittura)

Allineare alla struttura GHL con:

- **Header**: titolo "Modelli di email" + sottotitolo, pulsanti "Crea cartella" e dropdown "+ Nuovo" con opzioni:
  - Crea un modello da una campagna esistente
  - Modelli di email marketing (libreria pre-fatti)
  - Modello vuoto
  - Importa email (upload HTML)
- **Toolbar**: toggle vista (cronologica / lista), campo ricerca "Cerca modelli di email", pulsante "Filtra"
- **Breadcrumb cartelle**: navigazione "Home"
- **Tabella**: colonne (Titolo, Tipo, Aggiornato il, Aggiornato da) con menu contestuale (tre puntini)
- **Paginazione**: "Presentazione X - Y di Z risultati", Precedente/Successivo, selettore "10 / pagina"

### 4. Editor Template - Nessuna modifica sostanziale

L'editor HTML attuale e adeguato per la Fase 1. Lo screenshot GHL mostra una toolbar WYSIWYG (Paragrafo, Font, Size, B/I/U/S, link, ecc.) che richiederebbe una libreria rich-text (TipTap o Quill). Questo e previsto per una fase futura.

### 5. Database - Nuova tabella `email_folders`

Per supportare la navigazione a cartelle sia per campagne che per template:

```text
email_folders
  - id (uuid PK)
  - company_id (uuid)
  - name (text)
  - parent_id (uuid, nullable, self-reference)
  - folder_type (text: 'campaign' | 'template')
  - created_at (timestamptz)
```

Aggiungere colonna `folder_id` (uuid nullable) a `email_campaigns` e `email_templates`.

RLS: stesse policy pattern company_id delle tabelle email esistenti.

---

## Sezione tecnica

### File coinvolti

| Azione | File |
|--------|------|
| Riscrittura | `src/components/email-marketing/EmailStatsTab.tsx` |
| Riscrittura | `src/components/email-marketing/EmailCampaignsTab.tsx` |
| Riscrittura | `src/components/email-marketing/EmailTemplatesTab.tsx` |
| Riscrittura | `src/components/email-marketing/CampaignStatsCards.tsx` |
| Nuovo | `src/components/email-marketing/EmailPerformanceChart.tsx` |
| Nuovo | `src/components/email-marketing/EmailTopCampaignsTable.tsx` |
| Migration | tabella `email_folders` + colonna `folder_id` su campaigns e templates |

### Pattern UI replicati da GHL

- Layout a 2 colonne con sidebar filtri (tab Campagne)
- Tabella con colonne fisse e menu contestuale
- Breadcrumb per navigazione cartelle
- Paginazione con conteggio risultati
- Toggle vista cronologica / lista
- Card KPI con valore numerico grande e label sotto
- Grafico a linee con legenda multi-serie
- Dropdown con opzioni multiple per creazione contenuti

### Dati

Tutte le query leggono da `email_logs`, `email_campaigns`, `email_templates` filtrate per `company_id`. Le statistiche aggregano per status e raggruppano per campagna/periodo.
