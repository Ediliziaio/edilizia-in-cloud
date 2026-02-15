

# Pulizia, Fix e Stabilizzazione Progetto

## Analisi completata

Dopo un'analisi approfondita del codebase, ho identificato le seguenti aree di intervento. Il progetto e complessivamente ben strutturato, ma presenta alcune incongruenze, codice legacy e margini di miglioramento UX.

---

## 1. Pulizia codice

### Route duplicata / non necessaria
- **`/azienda/dipendenti`** (App.tsx riga 136): la pagina `Employees` e gia integrata dentro Settings come sotto-tab "Staff". La route standalone `/azienda/dipendenti` e ridondante e non presente nel menu laterale. Va rimossa da App.tsx.

### Import non utilizzati
- **`CompanyCostsManager.tsx`**: `Calculator`, `Info`, `MoreHorizontal` (gia usato altrove ma importato due volte nel contesto), `Filter` -- verificare uso effettivo di ciascuno e rimuovere quelli inutilizzati.

### Codice legacy nel CompanyCostsManager
- Le variabili `fixedCosts` e `manualVariableCosts` (riga 661-662) vengono calcolate ma non sempre referenziate in modo utile. Vanno verificate e, se non usate, rimosse.

---

## 2. Fix funzionali

### Bug 1: `vat_rate` mancante nel save ExternalTeam
In `Employees.tsx`, la mutation `saveTeamMutation` non salva il campo `vat_rate` durante update o insert. Questo significa che la aliquota IVA della squadra esterna non viene mai aggiornata.

**Fix**: aggiungere `vat_rate: data.vat_rate` nell'insert e update di `saveTeamMutation`.

### Bug 2: Employee salary costs non filtrati per company
In `CompanyCostsManager.tsx`, la query `active-employees-costs` filtra per `company_id`, ma i costi generati (`employeeAsFixedCosts`) usano `due_date: format(endOfMonth(new Date()), "yyyy-MM-dd")`. Questo valore e statico e non si adatta ai filtri di periodo. Se l'utente filtra per "mese prossimo", gli stipendi spariscono.

**Fix**: i costi stipendio dovrebbero avere `due_date` dinamico o essere esclusi dal filtraggio periodo (trattati come ricorrenti sempre presenti).

### Bug 3: `ExternalTeamDialog` non gestisce `vat_rate`
Il form `ExternalTeamDialog` non include un campo per l'IVA, ma la tabella `external_teams` ha la colonna `vat_rate`. Questo campo viene ignorato.

**Fix**: aggiungere il campo IVA nel dialog delle squadre esterne.

### Bug 4: `company_id` mancante nella insert costi magazzino
In `WarehouseStockTab.tsx`, la funzione `insertCostRecord` inserisce `company_id` correttamente, ma la query `forecast-company-costs` nel hook `useCashFlowData.ts` (riga 136-148) non filtra per `company_id`. Tutti i costi non pagati di tutte le aziende vengono caricati.

**Fix**: aggiungere `.eq("company_id", companyId!)` alla query `forecast-company-costs`.

### Bug 5: Ordini nella query forecast non filtrati per company
La query `forecast-orders` in `useCashFlowData.ts` (riga 34-51) non filtra per `company_id`. Carica tutti gli ordini di tutte le aziende.

**Fix**: aggiungere `.eq("company_id", companyId!)` e cambiare la condizione `enabled` di conseguenza.

---

## 3. Miglioramenti UX

### UX 1: Empty state piu chiaro per Staff Interno
Quando la tab "Staff Interno" e vuota, il messaggio generico "Nessun dipendente registrato" non e appropriato. Personalizzare il messaggio per ciascun tipo di ruolo.

### UX 2: Loading state consistente
Alcune pagine usano testo "Caricamento..." mentre altre usano Skeleton. Standardizzare su Skeleton per consistenza.

### UX 3: Feedback su azioni bulk nel CompanyCostsManager
Le azioni bulk (segna pagati, elimina) non mostrano una conferma intermedia prima di "segna pagati". Aggiungere conferma per operazioni massive (>5 elementi).

### UX 4: Tab dinamica in Employees
Quando il conteggio in una tab cambia dopo un'operazione, il numero nel badge della tab non si aggiorna immediatamente. E gia gestito tramite query invalidation, ma verificare che il refetch sia effettivo.

---

## 4. Dettaglio tecnico delle modifiche

| File | Modifica |
|------|----------|
| `src/App.tsx` | Rimuovere route `/azienda/dipendenti` e relativo import |
| `src/components/layouts/CompanyLayout.tsx` | Verificare che non ci siano link a `/azienda/dipendenti` nel nav (non ce ne sono, ma confermare) |
| `src/pages/azienda/Employees.tsx` | Fix: passare `vat_rate` nella mutation saveTeam |
| `src/components/employees/ExternalTeamDialog.tsx` | Aggiungere campo IVA nel form |
| `src/components/forecast/CompanyCostsManager.tsx` | Fix: rendere `employeeAsFixedCosts` compatibile con i filtri periodo; rimuovere import inutilizzati |
| `src/hooks/useCashFlowData.ts` | Fix: aggiungere filtro `company_id` alle query `forecast-orders` e `forecast-company-costs` |
| `src/components/employees/EmployeesTab.tsx` | UX: messaggio empty state personalizzato in base al tipo |
| `src/components/dashboard/LaborCostsStats.tsx` | Fix: aggiornare link "Gestisci" da `/azienda/dipendenti` a `/azienda/impostazioni` con tab staff pre-selezionata |

---

## 5. Riepilogo impatto

- **Codice rimosso**: 1 route inutilizzata, import morti, variabili non referenziate
- **Bug corretti**: 5 fix funzionali (filtri company_id, vat_rate, costi stipendio)
- **UX migliorata**: empty state, consistenza messaggi, link corretti
- **Nessun cambiamento al comportamento funzionale desiderato**

