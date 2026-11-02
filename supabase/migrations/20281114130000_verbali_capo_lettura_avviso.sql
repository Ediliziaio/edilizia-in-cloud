-- Spegnere un modello ferma i verbali nuovi, non cancella quelli fatti: il capocantiere continua a rileggerli.
-- verbale_capo_autorizzato (che vuole un modello attivo) resta per chi scrive.
create or replace function public.verbale_capo_assegnato(p_order_id uuid, p_user_id uuid)
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
  )
$$;
-- La chiama solo la funzione edge, con l'utente che ha già verificato.
revoke all on function public.verbale_capo_assegnato(uuid, uuid) from public, anon, authenticated;
grant execute on function public.verbale_capo_assegnato(uuid, uuid) to service_role;

-- Il pulsante Collaudo quando non ci sono modelli accesi: compare solo se c'è qualcosa da rileggere.
-- Stessa regola della funzione edge: modello che lo permetteva, oppure verbale fatto o fatto firmare da lui.
create or replace function public.verbali_capo_ne_ha(p_order_id uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if auth.uid() is null or v_company is null or public.utente_bloccato()
     or not public.verbale_capo_assegnato(p_order_id, auth.uid()) then
    return false;
  end if;
  return exists (
    select 1 from public.order_acceptance_reports r
     where r.order_id = p_order_id and r.company_id = v_company
       and (r.created_by = auth.uid() or r.firma_raccolta_da = auth.uid()
            or exists (select 1 from public.moduli_cantiere m
                        where m.id::text = r.content->>'modulo_id' and m.company_id = v_company and m.tipo = 'verbale'
                          and (m.schema->>'dal_cantiere')::boolean is true))
  );
end $$;
revoke all on function public.verbali_capo_ne_ha(uuid) from public, anon;
grant execute on function public.verbali_capo_ne_ha(uuid) to authenticated;

-- L'avviso riguarda il singolo verbale, non la commessa: due verbali firmati nella stessa giornata fanno due avvisi
-- (campo_notifica non ripete lo stesso avviso sullo stesso oggetto per 12 ore). Restituisce quanti l'hanno ricevuto,
-- così chi firma non legge «l'ufficio è stato avvisato» quando non è vero.
drop function if exists public.verbale_avvisa_ufficio(uuid);
create function public.verbale_avvisa_ufficio(p_report_id uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  r public.order_acceptance_reports;
  v_codice text;
  v_titolo text;
  v_dest uuid;
  v_avvisati integer := 0;
begin
  select * into r from public.order_acceptance_reports where id = p_report_id;
  if not found then return 0; end if;
  select order_code into v_codice from public.orders where id = r.order_id;
  v_titolo := case r.content->>'outcome'
    when 'negative' then 'Verbale firmato in cantiere con esito negativo'
    when 'reserves' then 'Verbale firmato in cantiere con riserve'
    else 'Verbale firmato in cantiere' end;
  for v_dest in select * from public.campo_destinatari_ufficio(r.company_id, r.order_id, r.firma_raccolta_da) loop
    if public.campo_notifica(r.company_id, v_dest, 'verbale_firmato_cantiere', v_titolo,
         coalesce(v_codice, 'Commessa') || ' · firmato da ' || coalesce(r.firma_cliente_nome, 'cliente'),
         'order_acceptance_report', r.id, '/azienda/ordini/' || r.order_id::text) is not null then
      v_avvisati := v_avvisati + 1;
    end if;
  end loop;
  return v_avvisati;
end $$;
revoke all on function public.verbale_avvisa_ufficio(uuid) from public, anon, authenticated;
grant execute on function public.verbale_avvisa_ufficio(uuid) to service_role;
