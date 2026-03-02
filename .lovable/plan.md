

# Expanded Row — Dati da Super Admin SaaS

## Cosa cambia

La Row 1 attuale ha 4 card (LTV, Ordini, Utenti, Onboarding). Il Super Admin vuole vedere subito i dati finanziari e di pagamento. Nuovo layout a **6 card**:

```text
Row 1 (6 card, griglia 2x3 mobile / 6 col desktop):
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│   MRR    │  Stato   │ Metodo   │ Fatturato│  Ordini  │  Utenti  │
│ €49/mese │ Attivo ✓ │ Stripe   │ €12.500  │  45/100  │   3/10   │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

### Dettaglio card:
1. **MRR** — `subscription_plans.price_monthly` (€/mese). Se null: "Nessun piano"
2. **Stato Abbonamento** — Badge colorato: active=verde, trial=blu, expired=rosso, suspended=grigio
3. **Metodo Pagamento** — Mostra il metodo effettivo (Stripe/Bonifico/Altro/Nessuno) con icona dedicata
4. **Fatturato Totale** (LTV) — `orderStats.totalValue` come ora
5. **Ordini** — Barra utilizzo come ora (X/Y)
6. **Utenti** — Barra utilizzo come ora (X/Y)

**Onboarding** spostato dentro la sezione Intelligence (Row 3), compatto.

## File modificati

### `src/pages/admin/CompaniesList.tsx`
- Passare `planInfo` (name, price_monthly) al `CompanyExpandedRow`

### `src/components/admin/company/CompanyExpandedRow.tsx`
- Aggiungere prop `planInfo?: { name: string; price_monthly: number }`
- Riscrivere Row 1: griglia 6 card (MRR, Stato, Metodo Pagamento, Fatturato, Ordini, Utenti)
- Spostare Onboarding % dentro la sezione Health Score (compatto, stesso stile)

Nessuna migrazione DB.

