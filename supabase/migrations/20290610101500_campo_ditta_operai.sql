-- Operai delle ditte subappaltatrici dall'app (26/11/2026, piano campo completo, punto 3.2, prima parte).
--
-- La ditta tiene dall'app l'elenco dei suoi operai per ogni cantiere, nella stessa tabella che l'ufficio vede
-- (subappaltatori_operai, legata alla scheda della ditta per quel cantiere: subappaltatori_sicurezza). Gli
-- attestati (idoneità, formazione) restano nel fascicolo della ditta e nelle qualifiche che verifica l'ufficio.
-- In cantiere il capo registra l'ingresso di un operaio della ditta anche senza tesserino, scegliendolo
-- dall'elenco della ditta per quel cantiere (esito «da verificare»).
-- Login personali per ogni operaio della ditta: non qui (serve un ruolo con permessi suoi).

-- Le schede della mia ditta (una per cantiere) con il nome del cantiere.
create or replace function public.campo_ditta_schede()
returns jsonb
language sql
stable security definer
set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('scheda_id', ss.id, 'order_id', ss.order_id,
            'cantiere', concat_ws(' · ', nullif(o.order_code, ''), nullif(left(o.description, 60), '')))
         order by o.order_code nulls last), '[]'::jsonb)
    from public.subappaltatori s
    join public.subappaltatori_sicurezza ss on ss.campo_subappaltatore_id = s.id and ss.company_id = s.company_id
    left join public.orders o on o.id = ss.order_id
   where s.user_id = auth.uid() and not public.utente_bloccato();
$$;

create or replace function public.campo_ditta_operai()
returns jsonb
language sql
stable security definer
set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', op.id, 'scheda_id', op.subappaltatore_id, 'nome', op.nome, 'cognome', op.cognome,
            'mansione', op.mansione, 'telefono', op.telefono, 'attivo', op.attivo,
            'cantiere', concat_ws(' · ', nullif(o.order_code, ''), nullif(left(o.description, 60), '')))
         order by op.cognome, op.nome), '[]'::jsonb)
    from public.subappaltatori s
    join public.subappaltatori_sicurezza ss on ss.campo_subappaltatore_id = s.id and ss.company_id = s.company_id
    join public.subappaltatori_operai op on op.subappaltatore_id = ss.id and op.company_id = ss.company_id
    left join public.orders o on o.id = ss.order_id
   where s.user_id = auth.uid() and not public.utente_bloccato();
$$;

create or replace function public.campo_ditta_operaio_salva(
  p_id uuid, p_scheda_id uuid, p_nome text, p_cognome text, p_mansione text, p_telefono text, p_attivo boolean)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ss record;
  v_id uuid;
begin
  if v_uid is null or public.utente_bloccato() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  select ss.id, ss.company_id into v_ss
    from public.subappaltatori_sicurezza ss join public.subappaltatori s on s.id = ss.campo_subappaltatore_id
   where ss.id = p_scheda_id and s.user_id = v_uid and s.company_id = ss.company_id;
  if v_ss.id is null then raise exception 'Cantiere della ditta non trovato.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_nome, ''))) not between 1 and 80 or length(btrim(coalesce(p_cognome, ''))) not between 1 and 80 then
    raise exception 'Scrivi nome e cognome.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.subappaltatori_operai (company_id, subappaltatore_id, nome, cognome, mansione, telefono, attivo)
    values (v_ss.company_id, v_ss.id, btrim(p_nome), btrim(p_cognome), nullif(btrim(coalesce(p_mansione, '')), ''),
            nullif(btrim(coalesce(p_telefono, '')), ''), coalesce(p_attivo, true))
    returning id into v_id;
  else
    update public.subappaltatori_operai
       set nome = btrim(p_nome), cognome = btrim(p_cognome), mansione = nullif(btrim(coalesce(p_mansione, '')), ''),
           telefono = nullif(btrim(coalesce(p_telefono, '')), ''), attivo = coalesce(p_attivo, true), updated_at = now()
     where id = p_id and subappaltatore_id = v_ss.id and company_id = v_ss.company_id
    returning id into v_id;
    if v_id is null then raise exception 'Operaio non trovato.' using errcode = '42501'; end if;
  end if;
  return v_id;
end;
$$;

-- Per il capo: gli operai attivi delle ditte che lavorano su questo cantiere.
create or replace function public.campo_ditte_operai_cantiere(p_order_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_company uuid;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_uid is null or v_company is null or v_company is distinct from public.get_my_company_id() or public.utente_bloccato()
     or not (public.e_amministratore_di(v_company)
             or exists (select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_uid and a.is_capocantiere)
             or exists (select 1 from public.squadre_commesse sc where sc.order_id = p_order_id and sc.squadra_id in (select public.campo_mie_squadre_capo()))) then
    raise exception 'Solo il capocantiere, il caposquadra o l''ufficio.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', op.id, 'nome', trim(op.nome || ' ' || op.cognome), 'ditta', ss.ragione_sociale, 'mansione', op.mansione)
                    order by ss.ragione_sociale, op.cognome)
                     from public.subappaltatori_sicurezza ss
                     join public.subappaltatori_operai op on op.subappaltatore_id = ss.id and op.company_id = ss.company_id and op.attivo
                    where ss.order_id = p_order_id and ss.company_id = v_company), '[]'::jsonb);
end;
$function$;

-- Ingresso di un operaio della ditta senza tesserino: resta «da verificare» nel registro.
create or replace function public.campo_ingresso_ditta(p_order_id uuid, p_operaio_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_company uuid; v_nome text; v_id uuid;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_uid is null or v_company is null or v_company is distinct from public.get_my_company_id() or public.utente_bloccato()
     or not (public.e_amministratore_di(v_company)
             or exists (select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_uid and a.is_capocantiere)
             or exists (select 1 from public.squadre_commesse sc where sc.order_id = p_order_id and sc.squadra_id in (select public.campo_mie_squadre_capo()))) then
    raise exception 'Solo il capocantiere, il caposquadra o l''ufficio.' using errcode = '42501';
  end if;
  select trim(op.nome || ' ' || op.cognome) || ' (' || coalesce(ss.ragione_sociale, 'ditta') || ')' into v_nome
    from public.subappaltatori_operai op join public.subappaltatori_sicurezza ss on ss.id = op.subappaltatore_id and ss.company_id = op.company_id
   where op.id = p_operaio_id and ss.order_id = p_order_id and ss.company_id = v_company and op.attivo;
  if v_nome is null then raise exception 'Operaio della ditta non trovato su questo cantiere.' using errcode = '42501'; end if;
  insert into public.campo_ingressi (company_id, order_id, giorno, hr_profilo_id, nome, esito, assegnato, registrato_da)
  values (v_company, p_order_id, (now() at time zone 'Europe/Rome')::date, null, left(v_nome, 200), 'da_verificare', true, v_uid)
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.campo_ditta_schede() from public, anon;
revoke all on function public.campo_ditta_operai() from public, anon;
revoke all on function public.campo_ditta_operaio_salva(uuid, uuid, text, text, text, text, boolean) from public, anon;
revoke all on function public.campo_ditte_operai_cantiere(uuid) from public, anon;
revoke all on function public.campo_ingresso_ditta(uuid, uuid) from public, anon;
grant execute on function public.campo_ditta_schede() to authenticated;
grant execute on function public.campo_ditta_operai() to authenticated;
grant execute on function public.campo_ditta_operaio_salva(uuid, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.campo_ditte_operai_cantiere(uuid) to authenticated;
grant execute on function public.campo_ingresso_ditta(uuid, uuid) to authenticated;
