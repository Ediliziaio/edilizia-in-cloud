

# UX Improvement: Tab "Incassato" del Previsionale Cassa

## Problemi Identificati

1. **Nessun indicatore di progresso** — l'utente non vede a colpo d'occhio quanto ha incassato rispetto a quanto atteso nel mese
2. **Filtri date poco intuitivi** — solo "Da/A" senza preset rapidi (questo mese, ultimo trimestre, anno)
3. **Tabelle "Da Ricevere" sparse** — 2-3 card separate per mese rendono la pagina lunga; manca una vista unificata
4. **Nessuna ricerca** — su tabelle con molti pagamenti non si puo cercare per cliente o ordine
5. **Nessun totale sempre visibile** nella tabella incassato (solo con filtro date attivo)
6. **Card sommario piatte** — nessuna differenziazione visiva tra incassato (positivo) e da ricevere (atteso)
7. **Pagamenti scaduti non evidenziati** — i pagamenti attesi con data passata non hanno indicazione visiva

## Piano di Intervento

### 1. Progress Bar "Incassato vs Atteso" (nuova card hero)
- Sostituire le 4 card con un layout a 2 righe:
  - **Riga 1**: Card hero larga con progress bar circolare o lineare che mostra `incassato / (incassato + da ricevere)` per il mese corrente, con importi e percentuale
  - **Riga 2**: 3 card compatte (Prossimo mese, Prossimi N mesi, Senza data)

### 2. Quick Date Presets
- Aggiungere chip/bottoni rapidi sopra i filtri data: "Questo mese", "Ultimo trimestre", "Quest'anno", "Tutto"
- Eliminare la necessita di aprire 2 date picker per i casi comuni

### 3. Tabella "Da Ricevere" unificata
- Unire le 2-3 sezioni "Da Ricevere" in una singola card con sotto-gruppi collassabili per mese
- Aggiungere badge rosso per pagamenti con data scaduta (overdue)
- Totale footer sempre visibile

### 4. Ricerca inline
- Aggiungere input di ricerca nella tabella incassato che filtra per cliente o codice ordine

### 5. Totale sempre visibile
- Footer sticky con totale nella tabella incassato, non solo quando il filtro date e attivo

### File da modificare

| File | Modifica |
|------|----------|
| `src/components/forecast/CollectedTab.tsx` | Riscrittura layout card, progress bar, quick presets, tabella unificata "Da Ricevere", ricerca inline, totale sticky |

