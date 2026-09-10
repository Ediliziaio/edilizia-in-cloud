-- L'audit leggeva lo user-agent dall'header `user-agent`, che le edge function
-- inoltravano tale e quale sul client con chiave di servizio. Supabase ha
-- iniziato a rifiutare quelle richieste — «Forbidden use of secret API key in
-- browser» — perché un user-agent da browser su una chiave segreta è il
-- sintomo di una chiave finita nel client. Risultato: get-settings tornava
-- `{}` e stats 0/0/0, in silenzio, e la pagina WhatsApp Locale non vedeva più
-- il gateway né i numeri.
--
-- Le edge function ora mandano `x-actor-user-agent`. Qui si legge quello, con
-- ripiego su `user-agent` per le richieste che arrivano davvero dal browser
-- con il JWT dell'utente (dove l'header è legittimo e va conservato).
--
-- La sostituzione è fatta sul testo della definizione corrente invece di
-- riscrivere per intero una funzione di 3.200 caratteri: il resto del corpo
-- resta bit-per-bit quello collaudato. Idempotente: se l'header nuovo c'è già
-- non tocca nulla.
do $$
declare def text; nuovo text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'tg_audit_log_row';

  if def is null then
    raise notice 'tg_audit_log_row assente: niente da fare';
    return;
  end if;

  if position('x-actor-user-agent' in def) > 0 then
    raise notice 'gia aggiornata';
    return;
  end if;

  nuovo := replace(def,
    'public.audit_request_header(''user-agent'')',
    'COALESCE(public.audit_request_header(''x-actor-user-agent''), public.audit_request_header(''user-agent''))');

  if nuovo = def then
    raise exception 'tg_audit_log_row: riga user-agent non trovata, correggere a mano';
  end if;

  execute nuovo;
end $$;
