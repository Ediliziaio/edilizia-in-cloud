

# Pianificazione costi ricorrenti — Data fine contratto invece di periodi manuali

## Problema attuale
Quando si crea un costo fisso con ricorrenza (mensile/trimestrale/annuale), il form chiede "Periodi da generare" come numero manuale. L'utente deve calcolare quanti mesi/trimestri mancano alla scadenza del contratto. Il comportamento corretto è: l'utente inserisce la **data di inizio** (scadenza) e la **data fine contratto**, e il sistema calcola automaticamente quanti periodi generare.

## Soluzione

### Modifiche al form — `src/components/forecast/CostFormDialog.tsx`

1. **Sostituire** il campo "Periodi da generare" (`Input type="number"`) con un campo **"Data fine contratto"** (`Input type="date"`)
2. **Calcolo automatico dei periodi**: in base a `due_date` (inizio) e `end_date` (fine contratto), calcolare automaticamente il numero di occorrenze in base alla ricorrenza:
   - Mensile: differenza in mesi
   - Trimestrale: differenza in mesi / 3
   - Annuale: differenza in anni
3. **Preview aggiornata**: mostrare "Verranno creati N costi da MMM yyyy a MMM yyyy" calcolato dalla data fine
4. Aggiornare `periodsPreview` per usare `end_date` al posto di `periods`

### Modifiche al modello dati — `src/hooks/useCompanyCostsMutations.ts`

5. Aggiungere `end_date: string` a `CostFormData`
6. Nel `defaultFormData`, impostare `end_date: ""`
7. Nella `saveMutation`, calcolare `periods` a runtime dalla differenza tra `due_date` e `end_date` prima del loop di inserimento — la logica di generazione resta invariata

### File coinvolti
- `src/components/forecast/CostFormDialog.tsx` — UI del form
- `src/hooks/useCompanyCostsMutations.ts` — tipo dati + calcolo periodi nel salvataggio

