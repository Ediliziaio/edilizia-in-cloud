

# Aggiornamento Ordini Demo — Stati, Articoli, Pagamenti e Attività

## Situazione Attuale
Tutti e 5 gli ordini sono in **Contratto Firmato** (posizione 0), tutti gli articoli sono **da_ordinare**, nessuna data lavoro, nessun assegnato, nessuna attività.

## Stati disponibili (in ordine di avanzamento)
0. Contratto Firmato → 1. Acconto Pagato → 2. Rilievo Tecnico → 3. In Produzione → 4. Produzione Finita → 5. Merce in Magazzino → 6. Posa Programmata → 7. Posa Completata

## Piano per ogni ordine

### ORD-001 (Bianchi, Bagno €15K) → **Posa Programmata** (pos 6)
- **Stato**: Posa Programmata — ordine più avanzato
- **Date**: work_start=2026-03-20, work_end=2026-04-05, expected_date=2026-04-10, warehouse_arrival=2026-03-15
- **Installment**: Acconto già pagato ✓, Saldo → pagato il 2026-04-01
- **Articoli**: entrambi → `consegnato`, is_paid=true, paid_date=2026-03-12
- **Assigned_to**: Florin Andriciuc
- **Status history**: inserire passaggi intermedi con date realistiche
- **Attività**: 3 task (1 completata, 2 in corso)

### ORD-002 (Verdi, Infissi €8.5K) → **In Produzione** (pos 3)
- **Stato**: In Produzione — a metà percorso
- **Date**: work_start=2026-04-10, expected_date=2026-05-15
- **Installment**: Acc.1 già pagato ✓, Acc.2 → pagato il 2026-04-08
- **Articoli**: entrambi → `ordinato`, deposit_paid=true, deposit_paid_date=2026-03-10
- **Assigned_to**: Enrico Goldoni
- **Attività**: 2 task (1 da fare)

### ORD-003 (Rossi, Tetto €22K) → **Merce in Magazzino** (pos 5)
- **Stato**: Merce in Magazzino — quasi pronto per posa
- **Date**: work_start=2026-04-01, work_end=2026-04-25, expected_date=2026-04-30, warehouse_arrival=2026-03-28
- **Installment**: Acc.1 ✓, Acc.2 → pagato 2026-03-25, Acc.3 → pagato 2026-04-18
- **Articoli**: entrambi → `consegnato`, is_paid=true, paid_date=2026-03-20
- **Assigned_to**: Florin Andriciuc
- **Attività**: 4 task (2 completate, 1 in corso, 1 da fare)

### ORD-004 (Neri, Fotovoltaico €12K) → **Rilievo Tecnico** (pos 2)
- **Stato**: Rilievo Tecnico — ancora in fase iniziale
- **Date**: expected_date=2026-05-30
- **Installment**: Acc.1 già pagato ✓, resto invariato
- **Articoli**: Kit pannelli → `ordinato`, Inverter → `da_ordinare`
- **Assigned_to**: Enrico Goldoni
- **Attività**: 2 task (1 da fare, 1 in corso)

### ORD-005 (Esposito, Pittura €6K) → **Posa Completata** (pos 7)
- **Stato**: Posa Completata — ordine chiuso
- **Date**: work_start=2026-02-20, work_end=2026-03-01, expected_date=2026-03-05, warehouse_arrival=2026-02-18
- **Installment**: Acconto → pagato 2026-03-01, Saldo → pagato 2026-03-03
- **Articoli**: entrambi → `consegnato`, is_paid=true, paid_date=2026-02-25
- **Assigned_to**: Florin Andriciuc
- **Attività**: 2 task (entrambe completate)

## Attività (Tasks) da creare — ~13 totali

| Ordine | Titolo | Priorità | Stato | Scadenza | Assegnato |
|--------|--------|----------|-------|----------|-----------|
| ORD-001 | Verificare impianto idraulico | alta | completata | 2026-03-18 | Florin |
| ORD-001 | Confermare data posa con cliente | normale | da_fare | 2026-03-28 | Enrico |
| ORD-001 | Preparare materiale per posa | normale | in_corso | 2026-03-25 | Florin |
| ORD-002 | Confermare misure infissi | alta | completata | 2026-03-15 | Enrico |
| ORD-002 | Sollecitare produzione infissi | normale | da_fare | 2026-04-20 | Enrico |
| ORD-003 | Sopralluogo tetto | alta | completata | 2026-03-10 | Florin |
| ORD-003 | Ordinare materiale copertura | normale | completata | 2026-03-15 | Florin |
| ORD-003 | Verificare arrivo merce magazzino | normale | in_corso | 2026-03-30 | Florin |
| ORD-003 | Programmare squadra per posa tetto | alta | da_fare | 2026-04-05 | Enrico |
| ORD-004 | Rilievo tecnico sul posto | alta | in_corso | 2026-03-20 | Enrico |
| ORD-004 | Richiedere pratica GSE | normale | da_fare | 2026-04-10 | Enrico |
| ORD-005 | Preparazione pareti e stuccatura | normale | completata | 2026-02-25 | Florin |
| ORD-005 | Tinteggiatura finale | normale | completata | 2026-03-01 | Florin |

## Operazioni SQL
1. **UPDATE orders** × 5 (current_status_id, date lavoro, assigned_to, expected_date, warehouse_arrival)
2. **UPDATE order_installments** × ~5 (pagamenti aggiuntivi)
3. **UPDATE order_items** × 10 (status, is_paid, paid_date, deposit_paid, etc.)
4. **INSERT order_status_history** × ~25 (storico passaggi di stato con date progressive)
5. **INSERT tasks** × 13

Nessun file di codice da modificare — solo operazioni dati via insert tool.

