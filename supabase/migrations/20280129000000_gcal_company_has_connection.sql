-- Google Calendar: il push CRM→Google non partiva per chi non è company_admin.
--
-- Sintomo reale (Suntech, 18/08/2026): il call center fissa gli appuntamenti e
-- li assegna al commerciale; il commerciale non li vedeva mai su Google.
-- 24 appuntamenti su 28 mai arrivati; gli unici 4 sincronizzati erano stati
-- mappati giorni dopo, quando il commerciale (company_admin) li aveva riaperti.
--
-- Causa: useGoogleCalendarSync, prima di chiamare la edge function, verifica
-- "c'è almeno una connessione Google in azienda?" con una SELECT diretta su
-- google_calendar_connections. Ma le policy di quella tabella sono, di
-- proposito, strette: `gcal_conn_select_personal` (vedi solo la tua) e
-- `gcal_conn_select_company_admin` (gli admin vedono quelle dei colleghi).
-- Uno staff senza Google collegato legge quindi 0 righe, il gate risulta
-- falso e il push esce con un return muto: nessun errore, nessun evento.
--
-- La edge function invece era già corretta: gira in service role e risolve
-- l'owner effettivo dall'assigned_to, quindi userebbe la connessione del
-- commerciale. Mancava solo che qualcuno la chiamasse.
--
-- Fix: una funzione SECURITY DEFINER che risponde alla sola domanda utile —
-- un booleano — senza esporre token, email o altro della connessione altrui.
create or replace function public.company_has_google_calendar_connection()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from google_calendar_connections c
    where c.status = 'connected'
      and c.company_id = (
        select p.company_id from profiles p where p.id = auth.uid()
      )
  );
$$;

comment on function public.company_has_google_calendar_connection() is
  'True se almeno un utente della company del chiamante ha Google Calendar collegato. SECURITY DEFINER perché le policy di google_calendar_connections mostrano allo staff solo la propria riga: senza questo, il push CRM→Google non parte quando l''appuntamento lo crea un collega non-admin per il titolare del calendario. Ritorna solo un booleano, nessun dato della connessione.';

revoke all on function public.company_has_google_calendar_connection() from public;
grant execute on function public.company_has_google_calendar_connection() to authenticated;
