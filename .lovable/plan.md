

# Fix: Template non caricati nelle impostazioni

## Problema identificato

Due cause:

1. **Manca la policy super_admin** sulla tabella `quote_templates` — se l'utente è super_admin (o impersona un'azienda), `get_user_company_id(auth.uid())` restituisce il company_id reale del super_admin, non quello impersonato. Quindi sia SELECT che INSERT/UPDATE vengono bloccati da RLS.

2. **0 template nel database** — nessun template è mai stato salvato con successo, probabilmente proprio a causa del punto 1.

## Correzioni

### 1. Migrazione: aggiungere policy super_admin

```sql
CREATE POLICY "super_admin_manage_all_templates"
ON public.quote_templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
```

Stessa policy anche per lo storage bucket `quote-template-assets` (SELECT, INSERT, DELETE).

### 2. Frontend: gestire errori visibili + stato vuoto

File: `src/pages/azienda/settings/SettingsQuoteTemplates.tsx`

- Aggiungere gestione errore nella UI (toast su errore query)
- Mostrare un messaggio chiaro quando non ci sono template ("Nessun template, creane uno")

### 3. Hook: loggare errori

File: `src/hooks/useQuoteTemplates.ts`

- Aggiungere `onError` o `meta` per mostrare toast su errore di fetch

### File modificati

| File | Modifica |
|------|----------|
| Migrazione SQL | Policy super_admin su `quote_templates` e storage |
| `src/hooks/useQuoteTemplates.ts` | Error handling migliorato |
| `src/pages/azienda/settings/SettingsQuoteTemplates.tsx` | Stato vuoto + feedback errori |

