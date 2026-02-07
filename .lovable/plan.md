

# Piano: Analisi e Miglioramento Sezione Magazzino + Dati di Esempio

## Analisi della Sezione Attuale

La sezione Magazzino e gia molto completa con:
- 3 viste: Lista, Kanban (drag-and-drop) e Calendario
- Alert di urgenza per articoli con posa imminente
- Statistiche con progress ring e valori economici
- Filtri avanzati (ricerca, stato, ordine, fornitore)
- Selezione multipla e azioni batch
- Esportazione CSV e stampa

---

## Miglioramenti Proposti

### 1. Quick Filter per Urgenza
Aggiungere pulsanti rapidi per filtrare articoli urgenti:
- "Mostra urgenti" - Solo articoli con posa < 7 giorni non pronti
- "Da gestire oggi" - Articoli che richiedono azione immediata

### 2. Indicatore Visivo Priorita nella Lista
Evidenziare gli articoli che necessitano attenzione con badge colorati in base alla priorita.

### 3. Miglioramento Empty State
Messaggio piu descrittivo quando non ci sono articoli, con suggerimenti su come aggiungere ordini.

### 4. Filtro Rapido per Settimana Corrente/Prossima
Bottoni per visualizzare rapidamente gli articoli con posa nella settimana corrente o prossima.

---

## Dati di Esempio

Creare 3 clienti e 3 ordini con articoli tipici del settore serramenti.

### Clienti da Creare

| Nome | Cognome | Email | Telefono |
|------|---------|-------|----------|
| Giuseppe | Bianchi | giuseppe.bianchi@email.it | 333-1234567 |
| Maria | Verdi | maria.verdi@email.it | 340-9876543 |
| Luca | Ferrari | luca.ferrari@email.it | 347-5551234 |

### Ordini da Creare

**Ordine 1 - Giuseppe Bianchi** (Posa tra 5 giorni)
| Articolo | Quantita | Stato | Prezzo Acquisto |
|----------|----------|-------|-----------------|
| Tapparelle PVC Bianco 120x160 | 4 | in_magazzino | 85 |
| Zanzariere a rullo 120x160 | 4 | ordinato | 45 |
| Motore tubolare 20Nm | 4 | da_ordinare | 120 |

**Ordine 2 - Maria Verdi** (Posa tra 12 giorni)
| Articolo | Quantita | Stato | Prezzo Acquisto |
|----------|----------|-------|-----------------|
| Tapparelle Alluminio Coibentato 100x140 | 6 | ordinato | 110 |
| Zanzariere plissettate 100x140 | 6 | in_magazzino | 65 |
| Motore tubolare 30Nm con telecomando | 6 | in_magazzino | 180 |

**Ordine 3 - Luca Ferrari** (Posa tra 3 giorni - URGENTE)
| Articolo | Quantita | Stato | Prezzo Acquisto |
|----------|----------|-------|-----------------|
| Tapparelle PVC Grigio 140x180 | 3 | in_magazzino | 95 |
| Zanzariere magnetiche 140x180 | 3 | da_ordinare | 35 |
| Motore tubolare 40Nm | 3 | ordinato | 150 |
| Centralina domotica 4 canali | 1 | in_magazzino | 250 |

---

## Struttura Tecnica

### Creazione Dati di Esempio

L'inserimento dei dati avviene in 4 fasi:

1. **Creazione Utenti Auth** (via Edge Function)
   - Crea utenti in auth.users con ruolo customer

2. **Creazione Profili**
   - Inserisce record in `profiles` con i dati anagrafici

3. **Creazione Ordini**
   - Inserisce 3 ordini in `orders` con date di posa differenziate

4. **Creazione Articoli**
   - Inserisce articoli in `order_items` con stati misti

### Fornitori Suggeriti

Per rendere i dati piu realistici, creeremo anche fornitori esempio:
- "ABC Serramenti" - per tapparelle
- "ZanzarTech" - per zanzariere  
- "MotorDom" - per motori e domotica

---

## File da Modificare

| File | Modifica |
|------|----------|
| `src/pages/azienda/Warehouse.tsx` | Quick filter urgenza + settimana corrente |
| `src/components/warehouse/WarehouseListView.tsx` | Badge priorita + empty state migliorato |
| `src/components/warehouse/WarehouseStats.tsx` | Aggiunta contatore articoli urgenti |

---

## Riepilogo

1. **Quick Filters**: Pulsanti rapidi per filtrare urgenze e settimana corrente
2. **Badge Priorita**: Indicatori visivi per articoli che necessitano attenzione
3. **Empty State Migliorato**: Messaggio descrittivo con call-to-action
4. **Contatore Urgenze**: Nelle statistiche, mostrare quanti articoli sono critici
5. **Dati di Esempio**: 3 clienti + 3 ordini con 13 articoli totali (tapparelle, zanzariere, motori)

