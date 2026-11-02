-- Il verbale di collaudo dal telefono: solo il capocantiere interno assegnato alla commessa, e solo se l'azienda ha un
-- modello attivo che lo permette. Senza un modello così, nel cantiere non cambia nulla.
create or replace function public.verbale_capo_autorizzato(p_order_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.order_campo_assignments a
      join public.orders o on o.id = a.order_id and o.company_id = a.company_id and o.deleted_at is null
     where a.order_id = p_order_id
       and a.user_id = p_user_id
       and a.is_capocantiere
       and a.role_type = 'employee'
       and exists (select 1 from public.moduli_cantiere m
                    where m.company_id = o.company_id and m.tipo = 'verbale' and m.attivo and m.deleted_at is null
                      and (m.schema->>'dal_cantiere')::boolean is true)
  )
$$;
-- La chiama solo la funzione edge, con l'utente che ha già verificato.
revoke all on function public.verbale_capo_autorizzato(uuid, uuid) from public, anon, authenticated;
grant execute on function public.verbale_capo_autorizzato(uuid, uuid) to service_role;

-- I modelli che il capo può usare su questa commessa: vuoto per tutti gli altri.
create or replace function public.verbali_modelli_per_ordine(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if auth.uid() is null or v_company is null or public.utente_bloccato() or public.utente_sola_lettura(v_company)
     or not public.verbale_capo_autorizzato(p_order_id, auth.uid()) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'schema', m.schema) order by m.nome)
      from public.moduli_cantiere m
      join public.orders o on o.id = p_order_id and o.company_id = m.company_id
     where m.tipo = 'verbale' and m.attivo and m.deleted_at is null and (m.schema->>'dal_cantiere')::boolean is true
  ), '[]'::jsonb);
end $$;
revoke all on function public.verbali_modelli_per_ordine(uuid) from public, anon;
grant execute on function public.verbali_modelli_per_ordine(uuid) to authenticated;

-- Un verbale firmato in cantiere: l'ufficio lo sa subito, e sa se ci sono riserve.
create or replace function public.verbale_avvisa_ufficio(p_report_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  r public.order_acceptance_reports;
  v_codice text;
  v_titolo text;
  v_dest uuid;
begin
  select * into r from public.order_acceptance_reports where id = p_report_id;
  if not found then return; end if;
  select order_code into v_codice from public.orders where id = r.order_id;
  v_titolo := case r.content->>'outcome'
    when 'negative' then 'Verbale firmato in cantiere con esito negativo'
    when 'reserves' then 'Verbale firmato in cantiere con riserve'
    else 'Verbale firmato in cantiere' end;
  for v_dest in select * from public.campo_destinatari_ufficio(r.company_id, r.order_id, r.firma_raccolta_da) loop
    perform public.campo_notifica(r.company_id, v_dest, 'verbale_firmato_cantiere', v_titolo,
      coalesce(v_codice, 'Commessa') || ' · firmato da ' || coalesce(r.firma_cliente_nome, 'cliente'),
      'order', r.order_id, '/azienda/ordini/' || r.order_id::text);
  end loop;
end $$;
revoke all on function public.verbale_avvisa_ufficio(uuid) from public, anon, authenticated;
grant execute on function public.verbale_avvisa_ufficio(uuid) to service_role;
