-- Tutto il contesto di una conversazione WhatsApp Locale in una chiamata sola.
--
-- Il pannello laterale mostrava stato, assegnatario e note, ma non diceva CHI
-- fosse la persona: per sapere se e' un cliente, se ha chiesto di non essere
-- ricontattato, o se sta rispondendo a una campagna a freddo bisognava uscire
-- dalla pagina. E' l'informazione che decide il tono della risposta, quindi
-- deve stare accanto alla chat, non a due clic di distanza.
--
-- Una funzione sola invece di quattro query dal browser: sono dati che si
-- guardano sempre insieme, e in rete lenta quattro andate e ritorno si vedono.

create or replace function public.openwa_contesto_chat(p_chat_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact uuid;
  v_phone   text;
  v_res     jsonb;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;

  -- Contatto e numero dai messaggi della chat (il piu' recente che li ha).
  select (array_agg(m.contact_id order by m.created_at desc) filter (where m.contact_id is not null))[1],
         (array_agg(m.contact_phone order by m.created_at desc) filter (where m.contact_phone is not null))[1]
    into v_contact, v_phone
  from public.openwa_messages m
  where m.wa_chat_id = p_chat_id;

  select jsonb_build_object(
    'contatto', (
      select to_jsonb(x) from (
        select c.id, c.first_name, c.last_name, c.email, c.phone, c.company_name,
               c.city, c.tags, c.optout_whatsapp, c.source, c.lead_score, c.created_at
        from public.marketing_contacts c where c.id = v_contact
      ) x
    ),
    -- Campagne a freddo che l'hanno raggiunta: chi risponde deve sapere se sta
    -- parlando con qualcuno che NON aveva chiesto di essere contattato.
    'campagne', coalesce((
      select jsonb_agg(to_jsonb(y) order by y.created_at desc) from (
        select ca.nome, d.stato, d.primo_inviato_at, d.risposto_at, d.created_at
        from public.openwa_campagna_destinatari d
        join public.openwa_campagne ca on ca.id = d.campagna_id
        where d.contact_id = v_contact
        limit 5
      ) y
    ), '[]'::jsonb),
    -- Opportunita' aperte: il motivo per cui questa conversazione esiste.
    'opportunita', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.created_at desc) from (
        select o.id, o.name, o.value, o.status, o.expected_close_date,
               st.name as stage, o.created_at
        from public.marketing_opportunities o
        left join public.marketing_pipeline_stages st on st.id = o.stage_id
        where o.contact_id = v_contact and o.deleted_at is null
        limit 5
      ) z
    ), '[]'::jsonb),
    'telefono', v_phone
  ) into v_res;

  return coalesce(v_res, '{}'::jsonb);
end;
$$;

comment on function public.openwa_contesto_chat is
  'WhatsApp Locale: scheda contatto + campagne che l''hanno raggiunto + opportunita'', per il pannello della conversazione.';

grant execute on function public.openwa_contesto_chat to authenticated;

-- Non letti totali del canale: serve al pallino sulla voce di menu, cosi' un
-- messaggio in arrivo si nota anche stando su un'altra pagina.
create or replace function public.openwa_non_letti()
returns integer
language sql
security definer
set search_path = public
as $$
  select case when public.is_super_admin(auth.uid())
    then (select count(*)::integer from public.openwa_messages
          where direction = 'inbound' and read_at is null)
    else 0 end;
$$;

grant execute on function public.openwa_non_letti to authenticated;
