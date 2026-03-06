

# Revisione Grafico Distribuzione Mensile Costi

## Problema attuale
Il grafico mostra 3 barre separate (Fissi, Variabili, Pagati). "Pagati" è spesso la barra più alta e non dà informazioni utili. Manca la visibilità sui **ritardi di pagamento**: se un costo era previsto a gennaio ma è stato pagato a marzo, non si vede l'incidenza dello scostamento.

## Nuova logica

Ogni mese mostra **quanto doveva essere pagato** (per scadenza) vs **quanto è stato effettivamente pagato** (per data pagamento):

- **Barra piena "Fissi"** (rosso): costi fissi con `due_date` nel mese (pagati o meno)
- **Barra piena "Variabili"** (giallo): costi variabili con `due_date` nel mese (pagati o meno)
- **Barra trasparente "Pagato effettivo"** (verde, opacity 0.3, bordo tratteggiato): somma dei costi la cui `paid_date` cade nel mese — indipendentemente dalla scadenza

Questo permette di confrontare: "dovevo pagare X questo mese, ne ho pagati Y". Se la barra verde è più bassa delle altre, hai ritardi. Se è più alta, stai recuperando arretrati.

## Modifiche

### `src/hooks/useCompanyCostsData.ts` (righe 393-422)
- **Fissi/Variabili**: contare TUTTI i costi con `due_date` nel mese, indipendentemente da `is_paid` — separati per `cost_type`
- **PagatoEffettivo**: nuovo campo — somma dei costi con `paid_date` nel mese (non `due_date`)
- Rinominare `Pagati` → `PagatoEffettivo`, aggiornare `Totale` = Fissi + Variabili

### `src/components/forecast/CostsStatsCards.tsx` (righe 220-234)
- Sostituire la barra "Pagati" con "Pagato Effettivo": `fill` verde, `fillOpacity` 0.3, `stroke` verde tratteggiato
- Aggiornare tooltip per mostrare il confronto Previsto vs Effettivo
- Aggiornare l'interfaccia `MonthlyDistItem`

