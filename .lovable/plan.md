

# Piano Miglioramento Sezione Costi Aziendali

## Analisi

La sezione è già ben strutturata con: KPI cards (annuali + periodo), tabella con paginazione/ordinamento, grafico distribuzione mensile, form completo, filtri avanzati. Il prompt chiede molte modifiche — le organizzo per priorità come richiesto.

---

## Fase 1 — Badge stati migliorati + Colonna Ritardo

### `CostsTable.tsx`
- **Badge aggiornati**: Modificare `getStatusBadge()` per includere:
  - 🟢 **Pagato** — verde (invariato)
  - 🟡 **In scadenza** — giallo con testo "In scadenza (N gg)"
  - 🔴 **Scaduto** — rosso con icona ⚠️ + "Scaduto Ngg" calcolato come `Math.ceil((now - due_date) / 86400000)`
  - 🔵 **Previsto** — blu chiaro per costi ricorrenti con due_date futura > 7gg
  - ⚪ **Da pagare** — grigio neutro (non scaduto, non in scadenza, non ricorrente futuro)

- **Nuova colonna "Ritardo"**: Aggiungere tra Stato e Ordine
  - Se scaduto non pagato: `+N gg` in rosso
  - Se pagato e `paid_date` e `due_date` presenti: delta giorni (verde se anticipato, rosso se in ritardo)
  - Altrimenti: `—`

---

## Fase 2 — KPI Cards ridisegnate

### `CostsStatsCards.tsx`
Sostituire le 6 card del blocco "Period Stats" con queste 6 card cliccabili:

| Card | Logica | Colore |
|------|--------|--------|
| Sostenuti (reali) | `is_paid === true` nel periodo | Verde |
| Previsti (ricorrenti) | `recurrence !== "once" && !is_paid && due_date > now` | Blu |
| Da pagare | `!is_paid && due_date < now` (scaduto) | Rosso |
| In scadenza (7gg) | `!is_paid && due_date entro 7gg` | Arancione |
| Pagato nel periodo | somma pagati nel periodo filtrato | Verde scuro |
| Scostamento | delta previsto vs sostenuto | Dinamico +/- |

### `CompanyCostsManager.tsx`
- Aggiungere prop `onCardFilter` che imposta `statusFilter` quando si clicca una card
- Le card filtrano la tabella sottostante al click

---

## Fase 3 — Tab aggiuntivi

### `CompanyCostsManager.tsx`
Sostituire i tab `Tutti / Fissi / Variabili` con:

```
[ Tutti ] [ Sostenuti ] [ Previsti ] [ In ritardo ] [ In scadenza ]
```

- **Sostenuti**: `is_paid === true`
- **Previsti**: `recurrence !== "once" && !is_paid && due_date > now`
- **In ritardo**: `!is_paid && due_date < now`
- **In scadenza**: `!is_paid && due_date in [now, now+7gg]`

Ogni tab mostra il conteggio. La logica di filtraggio viene spostata in `useCompanyCostsData.ts` che esporrà le liste pre-filtrate.

---

## Fase 4 — Alert Banner pagamenti scaduti

### `CompanyCostsManager.tsx`
Aggiungere un banner arancione sotto il titolo, visibile solo se `stats.overdueCount > 0`:

```
⚠️ Hai N pagamenti scaduti per un totale di €XX.XXX — [Visualizza]
```

Click su "Visualizza" → imposta tab su "In ritardo".

---

## Fase 5 — Grafico Previsto vs Sostenuto (toggle)

### `CostsStatsCards.tsx`
- Aggiungere stato `chartView: "current" | "comparison"` con toggle buttons
- Vista "Previsto vs Sostenuto":
  - Barra blu "Previsto" = somma costi con `due_date` nel mese
  - Barra verde "Sostenuto" = somma costi con `paid_date` nel mese
  - Tooltip con delta

I dati necessari (`monthlyDistribution`) contengono già sia `Totale` (previsto) che `PagatoEffettivo` (sostenuto) — basta cambiare le `Bar` renderizzate.

---

## Fase 6 — Form migliorato (nessuna migration necessaria)

### `CostFormDialog.tsx`
- Il campo "Tipo costo" (`fixed`/`variable`) è già presente — non serve "Sostenuto/Previsto" come tipo (è derivato dalla ricorrenza e dallo stato pagamento)
- Il campo "Ricorrenza" con "Data fine contratto" è già presente
- Il campo "Note" è già presente — aggiungere `maxLength={200}` alla Textarea
- Il campo "Data scadenza" è già obbligatorio

Non servono nuove colonne Supabase: la distinzione "sostenuto vs previsto" è calcolata client-side da `is_paid`, `recurrence` e `due_date`.

---

## File da modificare

1. **`src/hooks/useCompanyCostsData.ts`** — Aggiungere liste pre-filtrate per i nuovi tab + dati per le card cliccabili
2. **`src/components/forecast/CostsStatsCards.tsx`** — Ridisegnare card periodo + aggiungere toggle grafico + card cliccabili
3. **`src/components/forecast/CostsTable.tsx`** — Badge migliorati + colonna Ritardo
4. **`src/components/forecast/CompanyCostsManager.tsx`** — Nuovi tab + banner alert + gestione filtro da card
5. **`src/components/forecast/CostFormDialog.tsx`** — maxLength su note

Nessuna migration Supabase necessaria.

