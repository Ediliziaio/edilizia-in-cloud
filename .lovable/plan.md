

## Piano: Report Riconciliazione Esportabile

### Obiettivo
Aggiungere un bottone "Esporta" nella sezione riconciliazioni recenti che permetta di scaricare lo storico completo in CSV o XLSX.

### Modifiche

**1. Caricare tutte le riconciliazioni (non solo 100)**
- Nella query `recRes`, rimuovere il filtro `is("unmatched_at", null)` per il report e aumentare il limit, oppure fare una query separata all'export per prendere tutte le riconciliazioni (incluse quelle scollegate).

**2. Aggiungere bottone Esporta nel header "Riconciliazioni recenti"**
- Dropdown con due opzioni: CSV e XLSX.
- Usa la stessa pattern di `DashboardExport.tsx` / `ExportDialog.tsx` con XLSX già installato.

**3. Dati esportati**
Colonne:
- Data riconciliazione (`matched_at`)
- Tipo match (Auto/Manuale)
- Descrizione transazione
- Data transazione (`booking_date`)
- Importo riconciliato
- N° Fattura
- Cliente
- Totale fattura
- Note
- Stato (Attiva / Scollegata + data)

**4. Implementazione**
- Funzione `exportReconciliations(format: "csv" | "xlsx")` dentro `BankReconciliation.tsx`.
- Query on-demand di tutte le riconciliazioni della company (senza limit 100, incluse scollegate).
- Genera file con `XLSX.utils.json_to_sheet` + BOM UTF-8 per CSV.

### File coinvolti
| File | Azione |
|---|---|
| `src/components/tesoreria/BankReconciliation.tsx` | Aggiungere bottone export + logica export CSV/XLSX |

