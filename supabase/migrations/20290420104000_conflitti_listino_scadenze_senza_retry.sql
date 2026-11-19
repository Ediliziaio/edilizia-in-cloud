-- I conflitti applicativi restituiscono HTTP 409 senza il retry automatico del gateway.
-- Aggiorna anche le installazioni che hanno già ricevuto le prime due migrazioni.
set local lock_timeout='3s';
set local statement_timeout='60s';
do $$
declare firma text; definizione text;
begin
  foreach firma in array array[
    'public.listino_crea_area(uuid,text,text,text,jsonb)',
    'public.scadenza_modifica_manuale(uuid,timestamp with time zone,jsonb)',
    'public.scadenza_annulla_manuale(uuid,timestamp with time zone)'
  ] loop
    select pg_get_functiondef(firma::regprocedure) into definizione;
    if strpos(definizione,'40001')>0 then
      execute replace(definizione,'40001','PT409');
    end if;
  end loop;
end; $$;
notify pgrst,'reload schema';
