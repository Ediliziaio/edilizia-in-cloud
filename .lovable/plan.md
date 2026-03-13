

## Piano: INT-05 — KPI Fatturazione nel Cruscotto Aziendale

### Analisi critica — Adattamenti

La spec propone una view `dashboard_billing_kpi` complessa che referenzia tabelle inesistenti (`incassi_fattura`, `partite_aperte`). Il sistema reale ha:
- `movimenti_cassa_native` per incassi (non `incassi_fattura`)
- `fattura_pagamento_stato` view già esistente per stato pagamento
- `get_cruscotto_invoice_stats` RPC già nel cruscotto (con `total_outstanding`, `overdue_count`, `overdue_amount`, ecc.)

Non serve creare una nuova view SQL. I dati necessari si ottengono combinando query dirette su `documenti_fiscali` + la view `fattura_pagamento_stato` già esistente + l'RPC `get_cruscotto_invoice_stats` già integrato.

---

### 1. Hook `useDashboardBillingKPI.ts` (nuovo)

Crea `src/hooks/billing/useDashboardBillingKPI.ts`:
- Query `documenti_fiscali` per: fatturato mese, fatturato YTD, fatture in bozza, proforma aperti
- Query `movimenti_cassa_native` per: incassato mese (tipo=entrata, documento_id not null)
- Query `fattura_pagamento_stato` per: da incassare totale, scaduto, in scadenza 30gg
- Tutto aggregato in un singolo hook con `Promise.all`
- `staleTime: 5 * 60_000`, `refetchOnWindowFocus: true`

Aggiunge anche `useTopClientiByFatturato(companyId, limit)`:
- Query `documenti_fiscali` raggruppata per `anagrafica_id` con join su `anagrafiche_native`
- Ritorna top N clienti per fatturato YTD con importo da incassare

### 2. Componente `BillingKPIWidget` (nuovo)

Crea `src/components/cruscotto/BillingKPIWidget.tsx`:
- Visibile SOLO se `useBillingMode().isNative === true`
- 4 KPI card: Fatturato Mese, Incassato Mese, Da Incassare, Scaduto
- Ogni card cliccabile → naviga a `/azienda/fatturazione/documenti` o `/azienda/fatturazione/movimenti`
- Alert rosso per fatture scadute con CTA
- Alert giallo per fatture in bozza con CTA

### 3. Componente `ClienteSituazioneWidget` (nuovo)

Crea `src/components/cruscotto/ClienteSituazioneWidget.tsx`:
- Visibile SOLO se `isNative && topClienti.length > 0`
- Tabella compatta: Cliente, Fatturato YTD, Da Incassare
- Link "Fatture →" per ogni cliente

### 4. Integrazione nel Cruscotto

Aggiorna `src/pages/azienda/CruscottoAziendale.tsx`:
- Importa `BillingKPIWidget` e `ClienteSituazioneWidget`
- Inserisce `BillingKPIWidget` dopo la Hero section (sezione 1)
- Inserisce `ClienteSituazioneWidget` dopo la sezione Finanza (sezione 4)
- Entrambi wrappati in `SectionErrorBoundary`
- No realtime subscription (staleTime + refetchOnWindowFocus sufficienti; l'overhead realtime non giustificato per KPI aggregati)

### 5. Alert fatturazione nell'AlertPanel

Aggiorna `src/components/cruscotto/AlertPanel.tsx`:
- Aggiunge alert billing-native: fatture scadute, bozze da emettere, SDI con errori
- Usa `useBillingMode` per mostrare solo in modalità nativa

---

### File da creare/modificare

| File | Azione |
|---|---|
| `src/hooks/billing/useDashboardBillingKPI.ts` | Creare |
| `src/components/cruscotto/BillingKPIWidget.tsx` | Creare |
| `src/components/cruscotto/ClienteSituazioneWidget.tsx` | Creare |
| `src/pages/azienda/CruscottoAziendale.tsx` | Aggiungere widget |
| `src/components/cruscotto/AlertPanel.tsx` | Aggiungere alert fatturazione |

Nessuna migration SQL necessaria — i dati sono tutti disponibili tramite tabelle e view esistenti.

