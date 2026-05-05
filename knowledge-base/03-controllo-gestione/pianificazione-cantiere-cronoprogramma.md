---
area: 03-controllo-gestione
titolo: Pianificazione cantiere e cronoprogramma
tags: [cronoprogramma, gantt, pianificazione, durata-cantiere, fasi-lavoro]
livello: intermedio
applicabile_a: [pianificazione-cantiere, direzione-cantiere]
kpi_correlati: [scostamento-tempi, % completamento-su-pianificato]
versione: 1.0
aggiornato_il: 2026-05-04
---

# Cronoprogramma — pianificare il cantiere prima di iniziarlo

Il cronoprogramma è la rappresentazione grafica delle fasi di lavoro nel tempo, con dipendenze, durate, risorse. Per un cantiere ben gestito è il documento operativo più consultato dopo il computo.

## Componenti minimi

- **Fasi di lavoro** (Work Breakdown Structure — WBS): scomposizione gerarchica dell'opera in attività gestibili
- **Durate** stimate per ogni attività
- **Dipendenze**: predecessori e successori (FS = finish-to-start, SS = start-to-start, FF, SF)
- **Risorse** assegnate (operai, mezzi, subappalti)
- **Milestone** (eventi chiave: getto fondazioni, completamento struttura, posa serramenti, fine lavori)

## Tecniche standard

**Gantt**: barre temporali per ogni attività. Lettura immediata, ma poco potente per dipendenze complesse.

**CPM (Critical Path Method)**: identifica il **percorso critico** — la sequenza di attività che determina la durata totale del cantiere. Un giorno di ritardo su un'attività critica = un giorno di ritardo su tutto.

**PERT**: integra l'incertezza nelle durate (stima ottimistica, pessimistica, attesa).

In edilizia il Gantt + CPM è lo standard pratico.

## Costruzione tipica

1. **WBS**: scomporre l'opera in 30-100 attività di durata 2-15 giorni ciascuna.
2. **Stima durata**: sulla base di squadre disponibili e produttività attesa.
3. **Dipendenze**: chi inizia dopo che chi finisce.
4. **Risorse**: assegnare squadre e mezzi.
5. **Vincoli**: data inizio (consegna cantiere), data fine (penali oltre).
6. **Buffer**: aggiungere margine 10-15% per imprevisti.

## Aggiornamento durante l'esecuzione

Frequenza: settimanale per cantieri attivi.

Operazioni:
- Marcare le attività completate
- Aggiornare le % avanzamento delle attività in corso
- Identificare le attività in ritardo
- Ricalcolare il percorso critico
- Aggiornare la data fine attesa

## Strumenti

- **MS Project** — standard ma complesso
- **Primavera P6** — per opere infrastrutturali grandi
- **PriMus PI** — diffuso in Italia
- **Gantt online** (es. GanttProject, Smartsheet)
- **Sistemi gestionali integrati** che collegano cronoprogramma, contabilità lavori, KPI cantiere

## Errori comuni

1. **Cronoprogramma "decorativo"**: redatto a inizio cantiere e mai aggiornato.
2. **Durate sottostimate**: per "vendere" il contratto, durate pianificate poco realistiche.
3. **Dipendenze non rappresentate**: quando un'attività ritarda, il cronoprogramma non aggiorna automaticamente.
4. **Cronoprogramma scollegato dalla contabilità**: % completamento non si traduce in SAL.
5. **Una sola persona lo gestisce**: chi parte in ferie, il cronoprogramma muore.

## Cosa fare quando si è in ritardo

1. **Re-baseline**: aggiornare il piano alla data corrente con tutte le attività ritardate.
2. **Crashing**: aggiungere risorse alle attività critiche (operai aggiuntivi, ore straordinarie).
3. **Fast tracking**: parallelizzare attività che erano in serie (con rischio di rilavorazioni).
4. **Negoziare estensione tempi** con committente, motivata da cause non imputabili (varianti, sospensioni, eventi atmosferici eccezionali).
5. **Riserva formale** per i maggiori oneri se il ritardo non è imputabile.

## Crono economico — il collegamento con la cassa

Il cronoprogramma tradotto in € (curva a S) è il **piano economico finanziario del cantiere**:

- Quando saranno fatturati i SAL
- Quando saranno incassati i pagamenti (DSO atteso)
- Quando saranno sostenuti i costi (manodopera, materiali, subappalti)
- Quando si pagheranno le forniture (DPO atteso)

Differenza tra entrate e uscite cumulate = **fabbisogno di cassa** del cantiere. Per cantieri rilevanti, il fabbisogno massimo si raggiunge a metà cantiere, prima della raccolta del saldo.

Questo dato va in cassa aziendale: se il fabbisogno massimo è 200k e l'azienda ha solo 150k disponibili (fido + cassa propria), occorre rivedere il contratto (anticipo più alto, SAL più frequenti) prima di firmarlo.
