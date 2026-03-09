

# Allineamento finale V2 (senza emoji)

## 1. Migration DB
- Creare funzione dedicata `banking_set_updated_at` e riassegnare i trigger esistenti
- Aggiungere trigger `trg_bank_provider_configs_updated_at` su `bank_provider_configs`
- Aggiungere indice `idx_bank_sync_logs_status` su `bank_sync_logs(status)`
- Ricreare RPC `get_treasury_summary` con filtro `AND t.status = 'booked'` sulle subquery monthly

## 2. Logica date_from in `bank-sync/index.ts`
- Sostituire il fisso `-30 giorni` con: `conn.last_sync_at ? last_sync_at - 1 giorno : 90 giorni fa`
- Stessa modifica in `bank-sync-all-companies/index.ts`

### File modificati
- 1 nuova migration SQL
- `supabase/functions/bank-sync/index.ts` (righe 83-86)
- `supabase/functions/bank-sync-all-companies/index.ts` (righe 96-98)

