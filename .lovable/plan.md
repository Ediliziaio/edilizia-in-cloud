

# Miglioramento Sezione Aziende -- Dashboard e Intelligence

## Panoramica

Quando apri un'azienda, la prima cosa che vedi oggi e un form di modifica dati ("Dettagli di base"). Questo e sbagliato dal punto di vista SaaS: la prima vista deve darti il "polso" immediato dell'azienda -- quanto paga, quanto usa il prodotto, quanto fattura, quanti ordini ha. Il form e secondario.

---

## Intervento 1: Nuovo tab "Panoramica" come vista di apertura

Sostituire il tab di default "Dettagli di base" con un nuovo tab **"Panoramica"** che mostra subito:

**Riga 1 -- 4 KPI Card principali:**
- Valore Ordini totale (con variazione rispetto al mese precedente)
- Valore Medio per ordine
- Entrate mensili dall'azienda (piano + eventuali addon)
- Stato salute: giorni dall'ultimo ordine creato (verde se recente, rosso se oltre 30 giorni)

**Riga 2 -- Grafico Ordini nel Tempo:**
- AreaChart (recharts) con gli ordini creati per mese negli ultimi 6 mesi
- Mostra sia il conteggio ordini che il valore cumulativo

**Riga 3 -- Revenue Card:**
- Piano attuale con prezzo mensile/annuale
- MRR contribuito da questa azienda
- Data prossimo rinnovo (se subscription attiva)
- Lifetime Value (LTV): totale pagato dall'attivazione a oggi

**Riga 4 -- Mini tabelle affiancate:**
- Ultimi 5 ordini (gia esistenti in CompanyActivityTab, riutilizzati)
- Ultimi 5 ticket (gia esistenti)

**Riga 5 -- Azioni rapide** (spostate qui dall'attuale tab Attivita)

---

## Intervento 2: Colonna "Revenue" nella lista aziende

Aggiungere alla tabella `CompaniesList.tsx`:
- **Colonna "MRR"**: prezzo mensile del piano sottoscritto (gia disponibile dal join con `subscription_plans`)
- Questo permette di ordinare e vedere subito chi paga e chi no

---

## Intervento 3: Riorganizzazione Tab

L'ordine attuale: Dettagli | Team | SaaS | Abbonamento | Attivita

Nuovo ordine:
1. **Panoramica** (NUOVO - tab di default, con dashboard KPI + grafici + revenue)
2. **Dettagli** (form anagrafica, invariato)
3. **Team** (invariato)
4. **SaaS** (invariato)
5. **Abbonamento** (invariato)

Il tab "Attivita" viene eliminato perche i suoi contenuti (KPI cards, tabelle ordini/ticket, azioni rapide) sono tutti integrati nel nuovo tab "Panoramica" in forma migliorata.

---

## Dettagli Tecnici

### Nuovi file
- `src/components/admin/company/CompanyOverviewTab.tsx` -- Nuovo componente con:
  - KPI cards (valore ordini, media, revenue piano, health score)
  - AreaChart ordini per mese (recharts, gia installato)
  - Card revenue con LTV e dettagli piano
  - Tabelle ordini/ticket recenti (logica riutilizzata da CompanyActivityTab)
  - Azioni rapide

### File modificati
- `src/hooks/useCompanyDetail.ts` -- Aggiungere query per:
  - Ordini raggruppati per mese (ultimi 6 mesi) per il grafico
  - Calcolo "giorni dall'ultimo ordine" per l'health indicator
- `src/pages/admin/CompanyDetail.tsx` -- Aggiungere tab "Panoramica" come default, rimuovere tab "Attivita"
- `src/pages/admin/CompaniesList.tsx` -- Aggiungere colonna MRR dalla join gia esistente con subscription_plans
- `src/components/admin/company/CompanyActivityTab.tsx` -- Rimosso (contenuto migrato in CompanyOverviewTab)

### Dati disponibili senza modifiche al database
- MRR per azienda: `subscription_plans.price_monthly` (gia joined)
- Ordini per mese: query con filtro `created_at` e raggruppamento client-side
- Lifetime Value: `subscription_logs` per conteggio mesi attivi x prezzo piano
- Health score: differenza tra `now()` e `MAX(orders.created_at)`

Nessuna migrazione database necessaria.

