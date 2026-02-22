
# Fix Assegnazione Utenti nei Contatti Marketing

## Problema
Nella scheda dettaglio contatto marketing, i selettori **Titolare** e **Follower** mostrano **tutti i profili** dell'azienda (inclusi clienti, dipendenti, venditori) invece di mostrare solo gli **utenti** della sezione "Utenti" (company_admin e company_staff).

La causa e nella query a riga 191-203 di `MarketingContactDetail.tsx`:
```typescript
// ATTUALE - SBAGLIATO: prende TUTTI i profili
const { data, error } = await supabase
  .from("profiles")
  .select("id, first_name, last_name")
  .eq("company_id", companyId);
```

Non filtra per ruolo, quindi include clienti, dipendenti, venditori.

## Soluzione
Applicare lo stesso pattern gia usato in `AssignedToSelect.tsx`: dopo aver recuperato i profili, fare una seconda query su `user_roles` per filtrare solo `company_admin` e `company_staff`.

## Dettaglio tecnico

### File: `src/pages/azienda/marketing/MarketingContactDetail.tsx`
Modificare la query `company_staff` (righe 191-203):
1. Recuperare i profili con `company_id`
2. Recuperare i ruoli da `user_roles` per quegli utenti
3. Filtrare solo quelli con ruolo `company_admin` o `company_staff`
4. Restituire solo quei profili

La logica sara identica a quella di `AssignedToSelect.tsx` (righe 24-48).

## Altre pagine verificate
- `TaskDialog.tsx` usa gia `AssignedToSelect` che filtra correttamente
- `AssignedToSelect.tsx` e gia corretto
- Il problema e isolato a `MarketingContactDetail.tsx`

## File coinvolti

| File | Azione |
|---|---|
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Fix query staff: aggiungere filtro per ruolo |

## Cosa NON cambia
- Nessuna modifica al database
- Nessuna modifica a componenti condivisi
- Routing e sidebar invariati
