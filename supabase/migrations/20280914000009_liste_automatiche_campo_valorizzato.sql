-- Serve poter dire «ha il sito ma non ha la regione»: è la coda di lavoro
-- dell'arricchimento geografico, e deve rimpicciolirsi da sola man mano che i
-- contatti vengono geolocalizzati, non restare una fotografia di oggi.
--
-- `campo_valorizzato` guarda se una colonna è piena, e in `non` diventa «è
-- vuota». La whitelist delle colonne è esplicita: la regola arriva da JSON
-- scritto a mano e senza whitelist sarebbe un modo per leggere qualunque
-- campo della riga.
do $$
declare def text; nuovo text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'contatto_corrisponde_regola';

  if def is null then raise exception 'contatto_corrisponde_regola assente'; end if;
  if position('campo_valorizzato' in def) > 0 then raise notice 'gia presente'; return; end if;

  nuovo := replace(def,
    '    when ''tag'' then',
    '    when ''campo_valorizzato'' then'                                     || chr(10) ||
    '      return case regola->>''campo'''                                    || chr(10) ||
    '        when ''website''      then coalesce(c.website,'''') <> '''''     || chr(10) ||
    '        when ''region''       then coalesce(c.region,'''') <> '''''      || chr(10) ||
    '        when ''province''     then coalesce(c.province,'''') <> '''''    || chr(10) ||
    '        when ''city''         then coalesce(c.city,'''') <> '''''        || chr(10) ||
    '        when ''phone''        then coalesce(c.phone,'''') <> '''''       || chr(10) ||
    '        when ''email''        then coalesce(c.email,'''') <> '''''       || chr(10) ||
    '        when ''vat_number''   then coalesce(c.vat_number,'''') <> '''''  || chr(10) ||
    '        when ''ateco_code''   then coalesce(c.ateco_code,'''') <> '''''  || chr(10) ||
    '        when ''company_name'' then coalesce(c.company_name,'''') <> '''''|| chr(10) ||
    '        else false end;'                                                 || chr(10) ||
    ''                                                                        || chr(10) ||
    '    when ''tag'' then');

  if nuovo = def then raise exception 'punto di innesto non trovato'; end if;
  execute nuovo;
end $$;
