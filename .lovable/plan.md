
# Analisi Dashboard Azienda

## Stato Generale: Funzionante con 2 bug significativi

La dashboard e ben strutturata con query parallele (`Promise.all` con 7 query), gestione completa degli stati (loading, errore, vuoto), alert finanziari intelligenti e widget informativi. Nessun dead code trovato. Tutti gli import sono utilizzati.

---

## BUG TROVATI

### 1. Conteggio "Clienti" errato (Priorita: Alta)

**Il problema**: La query conta TUTTI i profili con `company_id` corrispondente:
```typescript
supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId!)
```

Ma la tabella `profiles` contiene anche admin e staff dell'azienda, non solo clienti. Verificato nel database:
- company `728fc9cf...` ha 4 profili: 1 admin + 2 clienti + 1 altro
- Il numero mostrato nella stat card "Clienti" e quindi gonfiato

**Fix**: Filtrare solo gli utenti con ruolo `customer` tramite join con `user_roles`:
```typescript
supabase.from("user_roles").select("id", { count: "exact", head: true })
  .eq("role", "customer")
```
E poi filtrare per company_id tramite join con profiles. Oppure contare direttamente dagli ordini i customer_id distinti.

### 2. Finanziamento escluso dal calcolo incassi (Priorita: Media)

**Il problema**: Gli ordini possono avere un `financing_amount` con `financing_paid`, `financing_expected_date`. Ma il calcolo "Da Incassare" e "Previsionale Incassi" considera solo:
- Acconto (`deposit`)
- Secondo acconto (`deposit_2`)
- Saldo (`balance`)

Il finanziamento viene completamente ignorato, sottostimando gli incassi previsti.

**Fix**: Aggiungere il blocco finanziamento nel calcolo `pendingRevenue` e nel calcolo `cashFlow`.

---

## NESSUN DEAD CODE

- Tutti gli import sono utilizzati nel JSX
- Le interfacce `RecentOrder` e `UrgentItem` sono entrambe utilizzate
- I componenti `LaborCostsStats` e `SupplierPaymentsSummary` sono entrambi renderizzati
- Le variabili `thisMonthEnd` e `nextMonthEnd` sono entrambe usate nei calcoli

---

## RIEPILOGO INTERVENTI

| File | Intervento | Priorita |
|------|-----------|----------|
| `CompanyDashboard.tsx` | Fix query clienti: contare solo ruolo "customer" | Alta |
| `CompanyDashboard.tsx` | Aggiungere finanziamento nei calcoli pendingRevenue e cashFlow | Media |

Nessun file da eliminare, nessun dead code da rimuovere.
