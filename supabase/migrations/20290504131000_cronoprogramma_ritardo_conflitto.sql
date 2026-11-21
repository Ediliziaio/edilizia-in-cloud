-- Corregge anche le installazioni che hanno già applicato la prima migrazione.
-- Una proposta superata è un conflitto applicativo, senza retry di PostgREST.
do $$
declare
  definizione text := pg_get_functiondef('public.cronoprogramma_ritardo_whatsapp(uuid,uuid,uuid,jsonb)'::regprocedure);
begin
  if strpos(definizione, '''40001''') > 0 then
    execute replace(definizione, '''40001''', '''PT409''');
  end if;
end;
$$;
