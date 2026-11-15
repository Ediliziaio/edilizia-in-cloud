-- Versamenti fiscali e banca: si riconoscono anche le uscite non classificate che parlano di tributi (15/11/2026)
--
-- Il 20290401210000 prendeva, fra le uscite senza voce di cassa, solo quelle con «F24» nella
-- descrizione. Le banche scrivono anche «INPS», «Erario», «Agenzia delle Entrate», «Contributi»,
-- «Ritenute», «Delega»: su Demo 2 i contributi in banca («Contributi datore …») non erano trovati e
-- ogni scadenza risultava «non trovata». Adesso private.cg_descrizione_f24 riconosce queste parole
-- (intere, per IVA, IRES, IRAP, IMU, INPS, INAIL e delega) in descrizione o riferimento. È una
-- stima: le uscite classificate con una voce di cassa restano la fonte sicura.

create or replace function private.cg_descrizione_f24(p_descrizione text, p_riferimento text)
returns boolean language sql immutable set search_path to '' as $$
  select (coalesce(p_descrizione, '') || ' ' || coalesce(p_riferimento, ''))
         ~* '(f24|\minps\M|\minail\M|erario|agenzia (delle )?entrate|tribut|ritenut|contribut|\mdelega\M|\miva\M|\mires\M|\mirap\M|\mimu\M)'
$$;
revoke all on function private.cg_descrizione_f24(text, text) from public, anon, authenticated;

do $p$
declare
  vecchio text := $a$(coalesce(t.description, '') ilike '%f24%' or coalesce(t.reference, '') ilike '%f24%')$a$;
  nuovo text := $b$private.cg_descrizione_f24(t.description, t.reference)$b$;
  f text;
  def text;
  attese integer;
begin
  foreach f in array array['private.cg_uscite_voci(uuid,date,date,text[],boolean)', 'public.cg_get_versamenti_fiscali(uuid,integer)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('private.cg_descrizione_f24' in def) > 0 then
      continue;
    end if;
    attese := case when f like 'private.%' then 1 else 2 end;
    if (length(def) - length(replace(def, vecchio, ''))) / length(vecchio) <> attese then
      raise exception '%: riconoscimento degli F24 non trovato % volte, la funzione è cambiata', f, attese;
    end if;
    execute replace(def, vecchio, nuovo);
  end loop;
end $p$;
