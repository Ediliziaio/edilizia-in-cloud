

# Rimozione Media Mobile e verifica chart

## Modifiche

### `src/components/forecast/CostsStatsCards.tsx`
- Rimuovere `MediaMobile` dall'interfaccia `MonthlyDistItem` (riga 28)
- Rimuovere il componente `<Line>` (righe 236-244)
- Rimuovere `Line` e `ComposedChart` dagli import se non più usati — in realtà `ComposedChart` è ancora necessario per le barre, oppure si può tornare a `BarChart` standard dato che non c'è più la linea
- Valutazione: conviene sostituire `ComposedChart` con `BarChart` per semplicità, dato che rimangono solo barre

### `src/hooks/useCompanyCostsData.ts`
- Rimuovere il secondo passaggio di calcolo della media mobile (il `.map` finale) e restituire direttamente `raw`

### Verifica logica barre
Le tre barre (Fissi, Variabili, Pagati) funzionano correttamente:
- **Fissi**: costi non pagati con `cost_type === "fixed"`
- **Variabili**: costi non pagati con `cost_type !== "fixed"`  
- **Pagati**: tutti i costi pagati (`is_paid === true`)

Questo è coerente: un costo pagato viene contato solo in "Pagati", non in Fissi/Variabili. Il totale mese = Fissi + Variabili + Pagati.

