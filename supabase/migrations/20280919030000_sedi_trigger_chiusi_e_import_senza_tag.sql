-- Due correzioni trovate ricontrollando il lavoro sulle sedi (19/09/2026).
--
-- 1. Le due funzioni dei trigger nascevano con EXECUTE a PUBLIC, quindi
--    richiamabili anche da un utente non loggato. Non erano sfruttabili (una
--    funzione che ritorna `trigger` parte solo da un trigger), ma la regola del
--    progetto è che una funzione nuova nasca chiusa, e alle funzioni di trigger
--    l'EXECUTE non serve affatto: il privilegio non si controlla allo scatto.
--    Provato come utente vero (Camilla, ruolo authenticated): il titolo si
--    compone uguale anche dopo la revoca.
--
-- 2. L'importazione CSV dalla pagina Contatti gira col token di chi importa,
--    quindi prendeva il tag «showroom <sede>» come un inserimento a mano. Si
--    esclude la fonte «importazione», quella che la pagina scrive quando il
--    file non ne porta una sua.

revoke all on function public.componi_titolo_appuntamento() from public, anon, authenticated;
revoke all on function public.tag_sede_del_contatto() from public, anon, authenticated;

create or replace function public.tag_sede_del_contatto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_attivo boolean;
  v_autore uuid;
  v_sede   text;
  v_tag    text;
begin
  select c.contatti_tag_sede into v_attivo from companies c where c.id = new.company_id;
  if not coalesce(v_attivo, false) then
    return new;
  end if;

  -- L'importazione CSV dalla pagina Contatti gira col token di chi importa,
  -- quindi senza questo controllo prenderebbe il tag come un inserimento a
  -- mano. «importazione» è la fonte che la pagina scrive quando il file non
  -- ne porta una sua.
  if lower(btrim(coalesce(new.source, ''))) = 'importazione' then
    return new;
  end if;

  v_autore := coalesce(new.created_by, auth.uid());
  if v_autore is null then
    return new;
  end if;

  select s.nome into v_sede
  from company_sedi_utenti u
  join company_sedi s on s.id = u.sede_id
  where u.company_id = new.company_id and u.user_id = v_autore and s.attiva;

  if v_sede is null then
    return new;
  end if;

  v_tag := 'showroom ' || lower(btrim(v_sede));

  if exists (select 1 from unnest(coalesce(new.tags, '{}'::text[])) t where lower(t) like 'showroom%') then
    return new;
  end if;

  new.tags := array_append(coalesce(new.tags, '{}'::text[]), v_tag);
  return new;
end
$$;

revoke all on function public.tag_sede_del_contatto() from public, anon, authenticated;
