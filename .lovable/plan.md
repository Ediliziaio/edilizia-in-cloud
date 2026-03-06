

# Analisi e Miglioramenti UX/Funzionalità -- Sezione Costi Aziendali

## Analisi della situazione attuale

La sezione e gia ben strutturata con: costi manuali + derivati da ordini unificati, filtri multipli, stats cards, grafico distribuzione mensile, gestione IVA, bulk actions, import/export CSV. Tuttavia, da un punto di vista finanziario e di usability, ci sono diverse aree di miglioramento.

---

## Miglioramenti proposti

### 1. Stats Cards -- Metriche piu utili e reattive ai filtri

**Problema**: Le stats mostrano sempre il mese corrente, ignorando il filtro periodo attivo. "IVA a debito" e "Fornitori da pagare" calcolano solo sui costi manuali, non sui derivati.

**Fix**:
- Le stats devono riflettere il periodo selezionato (se filtro "Prossimo mese", le cards mostrano i dati di quel mese)
- Aggiungere una card "Totale Periodo" che somma tutti i costi filtrati (pagati + non pagati)
- Il calcolo IVA e fornitori deve includere anche i costi derivati da ordini

### 2. Indicatore scadenze imminenti piu visibile

**Problema**: La tabella ha un badge "In scadenza" ma non c'e un alert visivo immediato nel header o nelle stats.

**Fix**:
- Aggiungere nella card "Da pagare" un sotto-contatore dei costi in scadenza nei prossimi 7 giorni con colore arancione
- Nella tabella, evidenziare le righe in scadenza con un leggero sfondo arancione (come gia fatto per i costi da ordine)

### 3. Colonna "Totale Lordo" nella tabella

**Problema**: La tabella mostra solo l'imponibile. Per chi gestisce la cassa, il valore rilevante e il lordo (quanto esce realmente dal conto).

**Fix**:
- Aggiungere una colonna "Totale" dopo "IVA" che mostra il lordo (imponibile + IVA)
- Il tooltip sull'imponibile rimane per il dettaglio, ma il lordo e visibile direttamente

### 4. Filtro periodo "Personalizzato" con date range

**Problema**: I preset di periodo sono limitati (questo mese, prossimo mese, ultimi 3, quest'anno). Manca un range personalizzato per analisi specifiche.

**Fix**:
- Aggiungere un'opzione "Personalizzato" al filtro periodo
- Quando selezionato, mostrare due date picker (Da / A) inline nei filtri

### 5. Riga totale in fondo alla tabella

**Problema**: Non c'e un totale di riga in fondo alla tabella per vedere la somma degli importi filtrati.

**Fix**:
- Aggiungere un `<tfoot>` con una riga che mostra: totale imponibile, totale IVA, totale lordo dei costi visibili
- Separare il totale in "da pagare" e "pagato" se utile

### 6. Ordinamento default piu intelligente

**Problema**: L'ordinamento default e per data scadenza crescente, il che mostra prima i costi vecchi/scaduti.

**Fix**:
- Default: prima i costi scaduti (rosso), poi quelli in scadenza (arancione), poi da pagare per data crescente, infine i pagati
- Questo mette in evidenza le urgenze senza necessita di filtrare

### 7. Grafico: aggiungere confronto con periodo precedente

**Problema**: Il grafico distribuzione mostra solo i prossimi 6 mesi, senza contesto storico.

**Fix**:
- Aggiungere una linea tratteggiata che mostra i costi dello stesso periodo dell'anno precedente (se disponibili)
- Oppure: aggiungere un toggle "Mostra pagati" per sovrapporre i costi gia sostenuti

---

## Dettagli tecnici di implementazione

### File coinvolti
- `src/components/forecast/CostsStatsCards.tsx` -- stats reattive ai filtri + indicatore scadenze
- `src/components/forecast/CostsTable.tsx` -- colonna lordo, riga totale footer, ordinamento intelligente, highlight scadenze
- `src/components/forecast/CompanyCostsManager.tsx` -- passaggio filtro attivo alle stats
- `src/hooks/useCompanyCostsData.ts` -- calcolo stats basato su filtro attivo, fix calcolo IVA/fornitori con ordini, filtro personalizzato
- `src/components/forecast/CostFormDialog.tsx` -- nessuna modifica

### Priorita suggerita
1. Riga totale footer (alto impatto, bassa complessita)
2. Colonna totale lordo (alto impatto, bassa complessita)
3. Stats reattive ai filtri + fix IVA su ordini (medio impatto, media complessita)
4. Ordinamento intelligente default (medio impatto, bassa complessita)
5. Highlight scadenze imminenti nelle righe (basso impatto, bassa complessita)
6. Filtro periodo personalizzato (medio impatto, media complessita)
7. Grafico con confronto storico (basso impatto, alta complessita -- fase successiva)

