

# MD6 — Call Center Stats + Soglie Colorizzate

## Panoramica

3 file da modificare. Aggiunta metriche call center, colorizzazione soglie, tabella operatori in Tab Team.

## Parte A — TabPanoramica.tsx

Dopo `DashboardKPICards`, aggiungere una mini-strip compatta con:
- 6 chip KPI principali (Lead Totali, Nuovi Lead, App. Fissati, Chiusura%, Show Rate, Ticket Medio) con soglie colorate su Show Rate (60/40%) e Chiusura (20/10%)
- Divisore verticale
- 2 chip Call Center (Chiamate, Tasso Risposta con soglia 50/30%)

Implementazione: creare un componente locale `KpiChip` con prop `thresholds?: { warning, critical, higherIsBetter }`. I chip con soglia sotto critical diventano `bg-red-50 border-red-200 text-red-700`, sotto warning `bg-yellow-50 border-yellow-200 text-yellow-700`.

La strip sostituisce `DashboardKPICards` con una riga personalizzata che legge da `data.kpi` e `data.kpi_prev` direttamente. Layout: `flex flex-wrap items-center gap-2` con un `Separator orientation="vertical"` tra i 2 gruppi.

## Parte B — TabAttivita.tsx

Riscrivere il contenuto con 2 sezioni:

1. **Appuntamenti** (4 card): App. Fissati, App. Svolti, Show Rate (soglia 60/40%), Contatti Lavorati — con colori soglia
2. **Call Center** (5 card aggregate + tabella operatore): Chiamate Totali, Risposte, Tasso Risposta (soglia 50/30%), Durata Media, App. da Chiamate — calcolati da `data.call_center` rows. Sotto le card: `DashboardCallCenter` per la tabella operatori. Se nessun dato call center: messaggio neutro.

Import aggiuntivi: `fmt`, `calcDelta`, `formatDuration` da utils. Rimuovere i 6 generic activity cards attuali.

## Parte C — TabTeam.tsx

Dopo `DashboardSalesTable`, se `data.call_center?.length > 0`, aggiungere una Card con tabella compatta operatori: colonne Operatore, Chiamate, Risposte, Tasso% (colorizzato verde/giallo/rosso su soglie 50/30%), App. Fissati, Conv. Call→App%.

Import aggiuntivi: `Table/TableBody/TableCell/TableHead/TableHeader/TableRow`, `Phone` icon, `fmt` da utils.

