

## Piano: Riscrittura UX Lista Documenti Fiscali (stile Fatture in Cloud)

Riscrittura completa di `DocumentiFiscaliList.tsx` con aggiunta di componenti e hook dedicati. Il file esistente viene **sostituito interamente**.

---

### Struttura file da creare/modificare

| File | Azione |
|------|--------|
| `src/hooks/billing/useMonthlyTimeline.ts` | **Nuovo** — hook per aggregazione mensile |
| `src/hooks/billing/useDocumentCounts.ts` | **Nuovo** — conteggi per tab |
| `src/components/fatturazione/MonthlyTimeline.tsx` | **Nuovo** — barra timeline scrollabile |
| `src/components/fatturazione/StatoBadge.tsx` | **Nuovo** — badge colorati per stato |
| `src/components/fatturazione/DocumentiFooter.tsx` | **Nuovo** — footer con totali + export XLS |
| `src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx` | **Sostituito** — pagina completa |

---

### Dettaglio implementazione

#### 1. `useMonthlyTimeline` hook
- Query su `documenti_fiscali` con select `data_emissione, totale_documento, tipo`
- Filtra per `company_id` e opzionalmente per `tipo`
- Raggruppa per anno-mese in una Map (da -12 mesi a +3 mesi)
- Ritorna array `MonthSummary[]` con `docCount` e `totalAmount`

#### 2. `useDocumentCounts` hook
- Query leggera: `select('tipo, stato')` filtrata per `company_id`
- Conta per tab: fatture (fattura+fattura_pa), proforma, nota_credito, ddt, preventivo
- No "cestino" fisico (il delete attuale è hard-delete; lo simuliamo con stato `annullata`)

#### 3. `MonthlyTimeline` componente
- Barra orizzontale scrollabile con `overflow-x-auto` e `scroll-snap`
- Ogni mese: nome abbreviato, conteggio doc, importo compatto (`formatCurrencyCompact`)
- Mese corrente evidenziato, mese selezionato con bordo `primary`
- Auto-scroll al mese corrente al mount
- Click su mese filtra la tabella; click di nuovo deseleziona

#### 4. Tab navigazione
- 4 tab: Fatture, Pro forma, Note di Credito, DDT, Preventivi (riuso `TIPO_TABS` esistenti ma con conteggi badge)
- Tab attiva con `border-b-2 border-primary`

#### 5. Barra filtri
- Filtro stato (Select): Tutte, Bozza, Emessa, Pagata, Scaduta
- Ricerca testo (Input con icona Search)
- Pulsante "Nuova fattura" a destra
- Pulsante "Azzera filtri" se attivi

#### 6. Tabella documenti (colonne aggiornate)
- **Stato**: `StatoBadge` con icona + colore (bozza=grigio, emessa=sky, pagata=emerald, scaduta=rosso, etc.)
- **Cliente**: da `cliente_snapshot.ragione_sociale`
- **Numero / Data**: numero + data formattata
- **Prox. Scadenza**: calcolo giorni da `data_scadenza` — "Scaduta da X gg" in rosso, "Scade in X gg" in amber
- **Importo**: `formatCurrency(totale_documento)`
- **Azioni**: dropdown menu (visualizza, modifica, duplica, PDF, XML, NC, segna pagata, elimina)

#### 7. `DocumentiFooter`
- Conteggio documenti, totale imponibile + IVA
- Dropdown "Esporta XLS" con opzioni (pagina corrente, tutti)
- Usa libreria `xlsx` già installata

#### 8. Filtro mese nella query
- Estende `useDocumentiFiscali` esistente: aggiunge parametri `data_da`/`data_a` calcolati dal mese selezionato
- Non serve modificare l'hook, già supporta `data_da` e `data_a`

### Note tecniche
- Usa `formatCurrency` da `@/lib/formatters.ts` per tutti gli importi
- La tabella DB non ha `deleted_at` — il "Cestino" userà filtro `stato = 'annullata'`
- Riusa `useDocumentiFiscali` hook esistente senza modifiche (supporta già tutti i filtri necessari)
- Riusa `downloadNativePDF`, `generateFatturaPAXML`, `creaNotaCredito` esistenti
- Mobile: tabella con `overflow-x-auto`, timeline con scroll orizzontale

