

# Miglioramento Dashboard Gestione Interna — Visione CEO

## Analisi Attuale

La dashboard attuale ha:
- 4 stat card (Ordini, Clienti, Ticket, Da Incassare)
- Alert finanziari (pagamenti scaduti, uscite > entrate)
- Ordini recenti, Previsionale incassi, Costi manodopera
- Alert magazzino, Pagamenti fornitori, Azioni rapide

**Cosa manca dal punto di vista di un CEO:**

1. **Nessun KPI di fatturato/margine** — Un CEO vuole vedere *fatturato del mese*, *margine lordo*, *trend vs mese precedente*. Oggi questi dati esistono solo nella pagina Previsionale/Marginalità, non nella dashboard principale.

2. **Nessun delta temporale** — Tutti i numeri sono assoluti, senza confronto con il periodo precedente (↑/↓ rispetto al mese scorso). Un imprenditore ha bisogno di capire la direzione.

3. **Cash flow troppo semplice** — Solo "questo mese" e "prossimo mese" senza mostrare le uscite. Il CEO vuole vedere il **saldo netto** (entrate - uscite), non solo le entrate.

4. **"Azioni Rapide" occupa una colonna intera** — È essenzialmente una lista di 4 link. Spreco di spazio prezioso che potrebbe mostrare dati operativi.

5. **Nessuna visione su attività/calendario** — Non ci sono task imminenti, appuntamenti del giorno, o scadenze della settimana.

6. **Nessun indicatore di performance team** — Quanti ordini chiusi questa settimana, tasso di avanzamento commesse, produttività.

## Piano di Miglioramento

### 1. Nuova riga KPI "CEO Strip" (sopra tutto)

Aggiungere un componente `DashboardCeoStrip.tsx` con 4 KPI con delta % vs mese precedente:

| KPI | Calcolo | Delta |
|-----|---------|-------|
| Fatturato Mese | SUM total_amount ordini creati questo mese | vs mese precedente |
| Margine Lordo % | Media margine da ordini con costi | vs mese precedente |
| Saldo Cassa Netto | Entrate attese - Uscite attese (mese corrente) | — |
| Ordini Chiusi Mese | COUNT ordini creati questo mese | vs mese precedente |

Questi dati vengono calcolati nella query esistente, aggiungendo le query per il mese precedente.

### 2. Migliorare il Cash Flow card → "Bilancio Mese"

Trasformare la card "Previsionale Incassi" in un mini bilancio:
- **Entrate attese**: come oggi
- **Uscite attese**: costi fissi + fornitori + squadre + provvigioni (dati già disponibili in `useCashFlowData`)
- **Saldo netto**: entrate - uscite, colorato verde/rosso
- Progress bar visiva entrate vs uscite

### 3. Sostituire "Azioni Rapide" con "Scadenze Settimana"

Mostrare le prossime scadenze operative:
- Pagamenti da incassare entro 7 giorni
- Pagamenti fornitori in scadenza
- Ordini con data lavori imminente

Questo è molto più utile per un CEO che una lista di link (i link sono già nel menu laterale).

### 4. Aggiungere delta % alle stat card esistenti

Modificare le 4 stat card per mostrare un piccolo indicatore ↑/↓ con la variazione rispetto al mese precedente (verde = crescita, rosso = calo).

### 5. Riordinare il layout

```text
┌──────────────────────────────────────────────────┐
│  CEO Strip: Fatturato | Margine | Saldo | Ordini │  ← NUOVO
├──────────────────────────────────────────────────┤
│  Alert finanziari (se presenti)                  │
├──────────────────────────────────────────────────┤
│  Stat Cards: Ordini | Clienti | Ticket | Incasso │  ← con delta %
├────────────┬────────────┬────────────────────────┤
│  Ordini    │  Bilancio  │  Costi Manodopera      │
│  Recenti   │  Mese      │                        │
├────────────┼────────────┼────────────────────────┤
│  Alert     │  Fornitori │  Scadenze Settimana    │  ← sostituisce
│  Magazzino │            │                        │    Azioni Rapide
└────────────┴────────────┴────────────────────────┘
```

### File da creare/modificare

| Azione | File |
|--------|------|
| Creare | `src/components/dashboard/DashboardCeoStrip.tsx` |
| Modificare | `src/pages/azienda/CompanyDashboard.tsx` (layout, query, delta %, rimozione Azioni Rapide, nuova sezione Scadenze) |

La query esistente viene estesa con i dati del mese precedente per calcolare i delta. Nessuna migrazione DB necessaria — tutti i dati sono già nelle tabelle esistenti.

