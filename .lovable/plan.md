

# Ristrutturazione Sezione Costi: Automazione Ricorrenze e Pulizia

## Il Bug dei 43.200 euro

Il calcolo "Distribuzione Annuale" e' sbagliato perche' moltiplica OGNI riga di costo per il suo fattore di ricorrenza (x12 per mensile). Se l'affitto a 900 euro/mese e' stato duplicato in 4 righe (tramite "Genera periodo"), il sistema calcola: 900 x 12 x 4 righe = 43.200 euro. Dovrebbe essere 900 x 12 = 10.800. Il dato e' fuorviante e va rimosso.

---

## Cosa viene rimosso

| Elemento | Motivo |
|----------|--------|
| Card "Stima Annuale" (blu) dalle stat cards | Calcolo sbagliato e fuorviante |
| Sezione "Distribuzione Annuale per Categoria" | Stessa logica errata |
| Pulsante "Genera periodo" nell'header | Sostituito dall'automazione nel form |
| Dialog "Genera costi ricorrenti" (AlertDialog) | Non piu' necessario |
| Variabile `annualEstimate` e relativo `useMemo` | Codice morto |
| Variabili `showDuplicateConfirm`, `duplicatePeriods` | Codice morto |
| Mutation `duplicateRecurringMutation` | Codice morto |
| Variabile `recurringCosts` | Codice morto |
| Import `CalendarPlus` e `TrendingUp` da lucide-react | Non piu' usati |

---

## Cosa viene aggiunto

### Campo "Numero periodi" nel form di creazione

Quando la ricorrenza e' diversa da "Una tantum", appare un campo numerico sotto la ricorrenza:

- Label: "Periodi da generare"
- Default intelligente: 12 per mensile, 4 per trimestrale, 1 per annuale
- Range: 1-60
- Anteprima testuale: "Verranno creati 12 costi da Mar 2026 a Feb 2027"
- Visibile solo in creazione (non in modifica, dove si tocca il singolo costo)

### Generazione automatica al salvataggio

Quando si salva un costo ricorrente con periodi maggiore di 1:

1. Inserisce il costo base alla data indicata
2. Genera automaticamente i costi successivi con date scalate (mese+1, mese+2, ecc.)
3. Ogni costo generato ha `is_paid: false`
4. Controlla duplicati (stessa azienda + nome + data) prima di inserire
5. Toast finale: "Creati 12 costi da Mar 2026 a Feb 2027"

### Flusso utente risultante

1. Clicca "Nuovo Costo"
2. Compila: nome "Affitto Ufficio", importo 900 euro, categoria "Affitto"
3. Seleziona ricorrenza: "Mensile"
4. Seleziona data: "01/03/2026"
5. Imposta periodi: 12
6. Vede: "Verranno creati 12 costi da Mar 2026 a Feb 2027"
7. Salva
8. Il sistema crea 12 righe da 900 euro, una per mese

---

## Dettaglio tecnico

### File modificato: `src/components/forecast/CompanyCostsManager.tsx`

**1. Nuovo campo in CostFormData**

Aggiungere `periods: string` con default `"1"`.

**2. UI nel dialog - Sezione Pianificazione**

Sotto il selettore "Ricorrenza", quando il valore non e' "once", mostrare:
- Input numerico "Periodi da generare" (1-60)
- Testo anteprima con date calcolate usando `addMonths`/`addQuarters`/`addYears`

**3. Modifica `saveMutation`**

Se `recurrence !== "once"` e `periods > 1` e non si sta editando:
- Loop da 0 a periods-1
- Calcola data per ogni periodo
- Batch insert con controllo duplicati
- Toast riepilogativo

**4. Riorganizzazione stat cards**

Da 6 a 5 cards. Griglia aggiornata a `xl:grid-cols-5`.

**5. Pulizia import**

Rimuovere `CalendarPlus` e `TrendingUp` dagli import di lucide-react.

---

## Nessuna modifica al database

Non servono nuove tabelle o colonne. Si usano le stesse righe `company_costs`, semplicemente ne vengono create multiple al salvataggio.

