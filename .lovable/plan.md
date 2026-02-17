

# Riga Espansa Arricchita - Lista Aziende

## Obiettivo
Quando si espande la riga di un'azienda, mostrare KPI operativi immediati oltre ai dati anagrafici gia presenti: guadagno totale, numero utenti, ultimo ordine, e livello di utilizzo.

## Dati da aggiungere nella riga espansa

1. **Valore totale ordini** - somma `total_amount` per `company_id`
2. **Ultimo ordine** - data dell'ordine piu recente, con indicatore "Health" (verde/giallo/rosso)
3. **Numero utenti** - conteggio profili (`profiles`) associati all'azienda
4. **MRR** - gia disponibile dal piano, mostrato in evidenza nel riquadro

## Dati NON disponibili
- "Ultimo accesso" non e accessibile dalla tabella `auth.users` tramite client. Si usa la data dell'ultimo ordine come proxy di attivita.

## Piano Tecnico

### File: `src/pages/admin/CompaniesList.tsx`

**Nuova query: dati aggregati per azienda**
Modificare la query `admin-companies-order-counts` per estrarre anche `total_amount` e `created_at`, poi aggregare lato client:
- `totalValue` (somma importi)
- `count` (numero ordini)  
- `lastOrderDate` (data piu recente)

**Nuova query: conteggio utenti per azienda**
Aggiungere una query su `profiles` raggruppata per `company_id` per ottenere il conteggio utenti per ogni azienda.

**Riga espansa ridisegnata**
Aggiungere una riga di KPI cards sopra i dati anagrafici con:

| KPI | Fonte | Icona |
|-----|-------|-------|
| Valore Totale Ordini | somma `total_amount` | DollarSign |
| N. Ordini | conteggio | ClipboardList |
| Ultimo Ordine | data + health badge | Calendar |
| Utenti Attivi | conteggio `profiles` | Users |
| MRR | dal piano sottoscritto | TrendingUp |

Le cards saranno compatte (griglia 5 colonne su lg, 3 su md, 2 su sm), con icona, valore e label. Sotto rimangono i dati anagrafici (P.IVA, PEC, telefono, ecc.) gia presenti.

### Struttura visiva della riga espansa

```text
+-------------+-------------+-------------+-------------+-------------+
| Valore Tot. | N. Ordini   | Ultimo Ord. | Utenti      | MRR         |
| EUR 45.200  | 12          | 3gg fa (v)  | 5           | EUR 49/mese |
+-------------+-------------+-------------+-------------+-------------+

Ragione sociale: ...  |  P.IVA: ...  |  Telefono: ...  |  PEC: ...
Note: ...

[Apri dettaglio]  [Accedi come azienda]
```

### Riepilogo modifiche

| File | Azione |
|------|--------|
| `CompaniesList.tsx` | Query ordini arricchita (value + lastDate), nuova query utenti, KPI cards nella riga espansa |

### Cosa rimane invariato
- Dati anagrafici nella riga espansa (P.IVA, PEC, telefono, SDI, note)
- Bottoni "Apri dettaglio" e "Accedi come azienda"
- Tabella principale con tutte le colonne esistenti
- Filtri, export CSV, impersonificazione
