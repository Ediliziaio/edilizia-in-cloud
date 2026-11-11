-- Due correzioni trovate provando 20290115110000 su casi veri.
--   Il costo usava la funzione col controllo dell'utente: il costo della riga
--   dipendeva da chi approvava. Ora si legge dalla scheda del dipendente.
--   Straordinario su un contratto senza maggiorazione: due righe uguali, la
--   seconda scartata come doppione e due ore perse. Ora una riga sola.
set local lock_timeout = '3s';
-- Match the same SQL fragment despite recovered formatting, exactly once.
create or replace function pg_temp.history_fragment(source text, fragment text) returns text
language plpgsql as $fragment$
declare pattern text:=''; ch text; matches text[]; n integer;
begin
 for ch in select regexp_split_to_table(fragment,'') loop
  if ch ~ '\s' then pattern:=pattern||'\s*';
  else pattern:=pattern||case when ch=any(array['(',')','[',']','{','}','.','*','+','?','^','$','|',E'\\']) then E'\\' else '' end||ch;end if;
 end loop;
 select count(*),min(m[1]) into n,fragment from regexp_matches(source,'('||pattern||')','g') m;
 if n<>1 then raise exception 'Recovered SQL fragment must match exactly once, found %',n;end if;
 return fragment;
end $fragment$;

do $$
declare
  v_def text;
  v_vecchio text := 'if v_ore > 0 then return query select v_nome, v_emp.id, v_t.id, v_ore, 0::numeric, round(v_ore * v_costo_ora, 2), null::text; end if;
      if v_extra > 0 then v_magg := coalesce(v_t.magg, v_ord.magg, 0); return query select v_nome, v_emp.id, v_t.id, v_extra, v_magg, round(v_extra * v_costo_ora, 2), null::text; end if;';
  v_nuovo text := 'v_magg := coalesce(v_t.magg, v_ord.magg, 0);
      if v_extra > 0 and v_magg = 0 then
        v_ore := v_ore + v_extra;
        v_extra := 0;
      end if;
      if v_ore > 0 then return query select v_nome, v_emp.id, v_t.id, v_ore, 0::numeric, round(v_ore * v_costo_ora, 2), null::text; end if;
      if v_extra > 0 then return query select v_nome, v_emp.id, v_t.id, v_extra, v_magg, round(v_extra * v_costo_ora, 2), null::text; end if;';
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'appalto_righe_da_rapportino_calcola' and pronamespace = 'public'::regnamespace;
  if position('costo_orario_calcolato' in v_def) > 0 and position('v_extra := 0' in v_def) > 0 then return; end if;
  if position(v_vecchio in v_def)=0 then v_vecchio:=pg_temp.history_fragment(v_def,v_vecchio);end if;
  if position(v_vecchio in v_def) = 0 or position('public.costo_orario_dipendente(v_emp.id)' in v_def) = 0 then
    raise exception 'appalto_righe_da_rapportino_calcola: testo non riconosciuto';
  end if;
  v_def := replace(v_def, v_vecchio, v_nuovo);
  v_def := replace(v_def, 'public.costo_orario_dipendente(v_emp.id)', 'public.costo_orario_calcolato(v_emp.id)');
  execute v_def;
end $$;
revoke all on function public.appalto_righe_da_rapportino_calcola(uuid) from public, anon, authenticated;
