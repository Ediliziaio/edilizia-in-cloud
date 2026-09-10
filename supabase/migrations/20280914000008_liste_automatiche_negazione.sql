-- Manca la negazione: senza, «imprese edili che NON sono anche serramentisti»
-- non è esprimibile, e chi fa entrambe le cose finirebbe in due flussi diversi
-- della stessa campagna — che è il modo più veloce per farsi riconoscere come
-- invio automatico. Il documento outreach lo dice esplicitamente: una lista per
-- volta, e chi è entrambe le cose va nel flusso serramentisti.
do $$
declare def text; nuovo text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'contatto_corrisponde_regola';

  if def is null then raise exception 'contatto_corrisponde_regola assente'; end if;
  if position('''non''' in def) > 0 then raise notice 'gia presente'; return; end if;

  nuovo := replace(def,
    '    when ''qualsiasi'' then',
    '    when ''non'' then'                                                       || chr(10) ||
    '      return not public.contatto_corrisponde_regola(c, regola->''regola'');' || chr(10) ||
    ''                                                                            || chr(10) ||
    '    when ''qualsiasi'' then');

  if nuovo = def then raise exception 'punto di innesto non trovato'; end if;
  execute nuovo;
end $$;
