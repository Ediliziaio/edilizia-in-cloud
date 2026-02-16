
# Stabilizzazione e Pulizia Tesoreria + Prompt di Analisi Completa

## Analisi dello stato attuale

Dopo un'analisi approfondita del codice, la Tesoreria e il modulo Previsionale sono funzionalmente corretti:
- La linea tesoreria usa gia `Math.max(0, cumulative)` (riga 388) -- il grafico non scende mai sotto zero
- Le barre entrate/uscite sono entrambe positive (fix precedente applicato)
- Il tooltip Agicap-style e implementato correttamente
- La griglia mostra i flussi netti mensili che possono essere negativi (comportamento corretto)
- Il toggle "Mostra Previsionale" funziona con overlay semi-trasparente

## Problemi identificati e correzioni

### 1. Bug nel tooltip con forecast attivo
Quando il toggle "Mostra Previsionale" e attivo, il tooltip NON mostra i dati previsionali (entrate/uscite previste, tesoreria prevista). Va aggiornato per includere anche queste informazioni quando `showForecast = true`.

### 2. Variabile `lastMonthTreasury` potenzialmente confusa
La variabile `lastMonthTreasury` (riga 518) e corretta e usata nel badge "Saldo", ma il suo nome potrebbe confondere. Nessuna modifica necessaria, solo annotazione.

### 3. Forecast cumulative senza floor a zero
Il calcolo del `forecastNetMonthly` (riga 451) NON applica `Math.max(0, ...)`. In una proiezione previsionale, potrebbe avere senso mostrare scenari negativi per evidenziare rischi. Tuttavia, per coerenza con la linea sostenuta, conviene applicare lo stesso floor: `forecastNetMonthly[k] = Math.max(0, forecastCum)`.

### 4. Pulizia codice
- Nessun import inutilizzato trovato nei file forecast
- Nessuna variabile morta
- Il codice e ben organizzato con la strategia di refactoring modulare gia in uso

## Piano di implementazione

### File: `src/components/forecast/TreasuryTab.tsx`

**A. Fix forecast cumulative (riga 451)**
Aggiungere `Math.max(0, ...)` anche per la linea previsionale:
```typescript
forecastNetMonthly[k] = Math.max(0, forecastCum);
```

**B. Tooltip con dati previsionali (righe 520-557)**
Quando `showForecast = true`, aggiungere sotto ogni sezione i valori previsionali:
```
TESORERIA
  Inizio      27.659 euro
  Fine        55.113 euro
  Variazione  +27.453 euro

ENTRATE
  Realizzato  62.305 euro
  Previsto    18.200 euro    <-- solo se showForecast

USCITE
  Realizzato  34.851 euro
  Previsto    12.500 euro    <-- solo se showForecast
```

Il tooltip deve ricevere lo stato `showForecast`. Dato che `CustomTooltip` e definito dentro il componente, ha gia accesso alla closure.

**C. Nessun file/componente/funzione da rimuovere**
L'analisi ha confermato che tutto il codice nel modulo forecast e utilizzato. Non ci sono import inutili, funzioni morte o componenti orfani.

## Prompt di Analisi Completa del Software

Come richiesto, ecco il prompt riutilizzabile per future analisi:

---

**PROMPT DA SALVARE:**

```
Agisci come Senior Full-Stack Engineer + QA Lead + UX Specialist.

OBIETTIVO: Analisi completa del software per identificare blocchi, errori e codice morto.

CHECKLIST DI ANALISI:

1. ERRORI CRITICI (Blocchi)
- Verifica che tutte le route siano raggiungibili e non restituiscano schermo bianco
- Controlla che le query Supabase abbiano gestione errori (try/catch o .error)
- Verifica che i form salvino correttamente (INSERT/UPDATE vanno a buon fine)
- Controlla loading state: nessun spinner infinito, nessun freeze UI
- Verifica che i ruoli (company_admin, company_staff, customer, employee, salesperson) accedano solo alle loro sezioni

2. ERRORI LIEVI (Warning/UX)
- Controlla la console per warning React (key mancanti, useEffect dependency, ecc.)
- Verifica che i toast di errore/successo appaiano correttamente
- Controlla che i dialog si chiudano dopo il salvataggio
- Verifica che le tabelle vuote mostrino un empty state chiaro
- Controlla che i filtri/ricerca funzionino senza lag

3. CODICE MORTO (Da rimuovere)
- Import non utilizzati in ogni file
- Variabili/costanti dichiarate ma mai lette
- Componenti definiti ma mai renderizzati
- Funzioni helper mai chiamate
- File .tsx/.ts non importati da nessun altro file
- Props passate ma mai usate nel componente figlio
- State (useState) dichiarati ma mai usati

4. PERFORMANCE
- Query Supabase senza staleTime (richieste duplicate)
- Re-render inutili (componenti grandi senza memo/useMemo)
- useEffect con dependency array sbagliata (loop infiniti)
- Immagini/asset non ottimizzati

5. SICUREZZA
- RLS policy mancanti su tabelle sensibili
- Dati sensibili esposti in console.log
- Token/chiavi hardcoded nel frontend

OUTPUT RICHIESTO:
- Lista errori critici con file e riga
- Lista errori lievi con severita (bassa/media)
- Lista codice morto da rimuovere (file, riga, motivo)
- Lista miglioramenti performance suggeriti
- Conferma "TUTTO OK" solo se zero errori critici
```

---

## Riepilogo modifiche

### File da modificare:
- `src/components/forecast/TreasuryTab.tsx`

### Cosa viene fatto:
1. **Fix**: Forecast cumulative con `Math.max(0, ...)` per coerenza
2. **UX**: Tooltip arricchito con dati previsionali quando toggle e attivo
3. **Nessuna rimozione**: tutto il codice attuale e utilizzato

### Cosa NON cambia:
- Logica sostenuto (gia corretta)
- Barre sempre positive (gia corretto)
- Griglia con valori negativi possibili (comportamento voluto)
- Struttura file e architettura modulare
