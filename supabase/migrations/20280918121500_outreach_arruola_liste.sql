-- Liste che alimentano i flussi cold: chi manca si iscrive con una chiamata.
--
-- Fino al 16/09/2026 l'arruolamento si faceva solo dal pannello, a ondate
-- (outreach-enroll). ThermoDMR aveva 2.629 iscritti su 7.735 contatti delle sue
-- due liste: gli info@ e gli ufficio@ non erano mai entrati. Marketing Edile ed
-- Edilizia in Cloud avevano i flussi pronti e nessuna lista iscritta.
--
-- Scelta del titolare (16/09): le liste dei brand si incrociano e va bene così,
-- sono servizi diversi scritti da indirizzi diversi. Quindi ogni brand prende
-- tutta la sua lista e il lock multi-brand qui non si usa. Restano due regole
-- dentro lo stesso brand: un indirizzo sta in un flusso solo, e un'azienda
-- riceve su un indirizzo solo.
--
-- outreach_liste_flussi dice quale lista alimenta quale flusso. Le regole sugli
-- indirizzi sono quelle di outreach-enroll, con info@ e ufficio@ ammessi (scelta
-- del titolare per tutti e tre i brand). Dentro un brand i flussi si alternano,
-- così partono tutti insieme; dentro un flusso le liste vanno in ordine di
-- priorità. I primi invii vanno in coda dopo quelli già in attesa del brand,
-- distanziati secondo la capacità delle sue caselle.

create table if not exists public.outreach_liste_flussi (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.marketing_contact_lists(id) on delete cascade,
  sequence_id uuid not null references public.outreach_sequences(id) on delete cascade,
  priorita    integer not null default 100,
  attivo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (list_id, sequence_id)
);

alter table public.outreach_liste_flussi enable row level security;
revoke all on public.outreach_liste_flussi from anon;

drop policy if exists outreach_liste_flussi_super on public.outreach_liste_flussi;
create policy outreach_liste_flussi_super on public.outreach_liste_flussi
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

drop policy if exists blocco_utente_bloccato on public.outreach_liste_flussi;
create policy blocco_utente_bloccato on public.outreach_liste_flussi
  as restrictive for all to authenticated using (not (select utente_bloccato()));

-- Il dispatcher legge la coda per brand e per tipo (primi contatti / follow-up)
-- in ordine di orario: con decine di migliaia di primi contatti serve l'indice.
create index if not exists idx_outreach_queue_brand_dovuti
  on public.outreach_send_queue (brand_id, primo_contatto, scheduled_for)
  where status = 'queued' and kind = 'send';

insert into public.outreach_liste_flussi (list_id, sequence_id, priorita)
select v.list_id, v.sequence_id, v.priorita
  from (values
    -- ThermoDMR
    ('a1172c4b-0c8c-40ad-8035-c5fd7f76b800'::uuid, '586c7b7d-89cb-4fe0-88ab-b09c72990f6f'::uuid, 10), -- S Serramentisti Nord
    ('fe9f7d1c-cd7b-45d3-b66f-be4a812d5e1c'::uuid, '947ad9fa-9f86-48c4-abdc-9de53504e410'::uuid, 11), -- C Edili e ristrutturazioni Nord
    -- Marketing Edile: prima le 5 regioni, poi le altre
    ('d1f70a91-05de-42f1-9f38-f61bd32cb0c5'::uuid, '53e643d4-202a-4001-9498-5b7d70ea7031'::uuid, 20), -- 1 Serramenti 5 regioni
    ('e3024e9e-739c-4425-be83-708f34699a33'::uuid, '3afa7cad-7504-4057-80d3-05dc56555d6d'::uuid, 21), -- 3 Bagni 5 regioni
    ('fc4ff2e9-87e2-4a24-9037-a55c03c0721c'::uuid, '80b0694b-c985-4acd-881a-11d1f8a7a163'::uuid, 22), -- 4 Fotovoltaico 5 regioni
    ('66f4364f-cb03-4a27-944d-b09a1a3ed3a1'::uuid, 'caea4e4e-60a5-4b3c-be16-e0effad7a2b6'::uuid, 23), -- 5 Tetti 5 regioni
    ('93445abf-0ece-430a-9643-5d3f37585904'::uuid, '53e643d4-202a-4001-9498-5b7d70ea7031'::uuid, 24), -- 2 Serramenti altre regioni
    ('3c0611fc-28fe-4243-9561-79c0b2640042'::uuid, '3afa7cad-7504-4057-80d3-05dc56555d6d'::uuid, 25), -- 6 Bagni altre regioni
    ('16b597d4-5878-4f8d-b29b-b0ba805ab851'::uuid, '80b0694b-c985-4acd-881a-11d1f8a7a163'::uuid, 26), -- 7 Fotovoltaico altre regioni
    ('3457c7c9-9da1-484d-a27b-78c80ac29fb2'::uuid, 'caea4e4e-60a5-4b3c-be16-e0effad7a2b6'::uuid, 27), -- 8 Tetti altre regioni
    -- Edilizia in Cloud: nell'ordine dei numeri delle liste
    ('b73a1f81-60c4-46b3-b95c-fea438228858'::uuid, '571af13f-1f66-410e-9dab-95d8ae41c610'::uuid, 30), -- 1 Serramenti 5 regioni
    ('58ee5070-5294-4c6e-b1a5-962bf64afcae'::uuid, '9e3cb8b0-1d82-40f7-b161-bd650d8d4d73'::uuid, 31), -- 2 Ristrutturazioni 5 regioni
    ('3e6c7162-ab0c-49ed-9a6d-fceedf760dc1'::uuid, '88325fe8-a90c-4a85-a00e-90047aff4faf'::uuid, 32), -- 3 Bagni 5 regioni
    ('9e39697b-25e1-4be7-9f66-2015bc7cf344'::uuid, '571af13f-1f66-410e-9dab-95d8ae41c610'::uuid, 33), -- 4 Serramenti resto d'Italia
    ('4741b621-c43a-43fd-a580-e7e56ac65321'::uuid, '9e3cb8b0-1d82-40f7-b161-bd650d8d4d73'::uuid, 34), -- 5 Ristrutturazioni resto d'Italia
    ('ea983c4f-a5ad-4013-af51-74891ece5727'::uuid, '88325fe8-a90c-4a85-a00e-90047aff4faf'::uuid, 35), -- 6 Bagni resto d'Italia
    ('78bba222-43bb-420c-8528-f14b73132908'::uuid, '1db0074c-d994-4c5a-9664-e97ea59a07c9'::uuid, 36), -- 7 Tutti gli altri 5 regioni
    ('28c1a2aa-43eb-4d2c-8231-ce89e015e46b'::uuid, '1db0074c-d994-4c5a-9664-e97ea59a07c9'::uuid, 37)  -- 8 Tutti gli altri resto d'Italia
  ) as v(list_id, sequence_id, priorita)
 where exists (select 1 from public.marketing_contact_lists l where l.id = v.list_id)
   and exists (select 1 from public.outreach_sequences s where s.id = v.sequence_id)
on conflict (list_id, sequence_id) do nothing;

create or replace function public.outreach_arruola_liste(
  p_inizio timestamptz default null,
  p_max    integer     default 3000
) returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  c_piattaforma constant uuid := '00000000-0000-0000-0000-000000000001';
  -- Stesse regole di _shared/outreach-email-check.ts (PEC) ed email-quality.ts.
  c_pec constant text := '(^|[.@-])pec([.@-]|$)|legalmail|arubapec|postacert|sicurezzapostale|mypec|pecimprese|ingpec|geopec|legalpec|cert\.legalmail|pec-?legal|postecert|actaliscertymail|cgn\.legalmail|pecmail';
  c_usa_e_getta constant text[] := array['mailinator.com','tempmail.com','temp-mail.org','10minutemail.com',
    'guerrillamail.com','yopmail.com','trashmail.com','getnada.com','sharklasers.com','fakeinbox.com',
    'throwawaymail.com','maildrop.cc','dispostable.com'];
  c_gratuiti constant text[] := array['gmail.com','googlemail.com','hotmail.com','hotmail.it','outlook.com',
    'outlook.it','live.com','live.it','yahoo.com','yahoo.it','icloud.com','me.com','libero.it','virgilio.it',
    'alice.it','tin.it','tiscali.it','email.it','fastwebnet.it'];
  v_brand    record;
  v_c        record;
  v_step     record;
  v_az       uuid;
  v_enr      uuid;
  v_cap      numeric;
  v_gap      double precision;
  v_base     timestamptz;
  v_orario   timestamptz;
  v_n        integer;
  v_fatti    integer := 0;
  v_motivo   text;
  v_iscritti jsonb := '{}'::jsonb;
  v_saltati  jsonb := '{}'::jsonb;
begin
  if coalesce(p_max, 0) <= 0 then
    return jsonb_build_object('totale', 0);
  end if;
  -- Meglio saltare un giro che bloccare il dispatcher.
  perform set_config('lock_timeout', '5s', true);

  for v_brand in
    select s.brand_id, min(lf.priorita) as prio
      from outreach_liste_flussi lf
      join outreach_sequences s on s.id = lf.sequence_id and s.status = 'active'
      join outreach_brands b on b.id = s.brand_id and b.status = 'active'
     where lf.attivo
       and exists (select 1 from outreach_sequence_steps st where st.sequence_id = s.id and st.channel = 'email')
     group by s.brand_id
     order by min(lf.priorita)
  loop
    exit when v_fatti >= p_max;

    -- Distanza tra due primi contatti secondo la capacità del pool, come
    -- spreadFirstTouch: 660 minuti di finestra divisi per i tetti delle caselle,
    -- mai sotto i 90 secondi.
    select coalesce(sum(greatest(0, least(a.daily_cap_target, a.warmup_base + a.warmup_day * a.warmup_step))), 0)
      into v_cap
      from outreach_sender_accounts a
     where a.brand_id = v_brand.brand_id
       and a.status in ('active', 'warming')
       and coalesce(a.connection_status, '') <> 'error';
    v_gap := greatest(90, 39600.0 / greatest(v_cap, 1));

    -- In coda dopo i primi contatti già in attesa del brand.
    select greatest(coalesce(p_inizio, now()),
                    coalesce(max(q.scheduled_for) + make_interval(secs => v_gap), '-infinity'::timestamptz))
      into v_base
      from outreach_send_queue q
     where q.brand_id = v_brand.brand_id and q.status = 'queued' and q.primo_contatto;
    v_n := 0;

    for v_c in
      with membri as (
        select distinct on (lf.sequence_id, c.id)
               lf.sequence_id, lf.priorita, c.id as contact_id, btrim(c.email) as email,
               lower(split_part(btrim(c.email), '@', 2)) as dominio
          from outreach_liste_flussi lf
          join outreach_sequences s on s.id = lf.sequence_id and s.brand_id = v_brand.brand_id and s.status = 'active'
          join marketing_contact_list_members m on m.list_id = lf.list_id
          join marketing_contacts c on c.id = m.contact_id
         where lf.attivo
           and exists (select 1 from outreach_sequence_steps st where st.sequence_id = s.id and st.channel = 'email')
           and c.company_id = c_piattaforma
           and c.deleted_at is null
           and btrim(coalesce(c.email, '')) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
           and not coalesce(c.optout_email, false)
           and not coalesce(c.unsubscribed, false)
           and not coalesce(c.opt_out, false)
           and (c.ricontatta_dopo is null or c.ricontatta_dopo <= now())
         order by lf.sequence_id, c.id, lf.priorita
      ), idonei as (
        select mb.*,
               row_number() over (partition by mb.sequence_id order by mb.priorita, mb.contact_id) as rango,
               min(mb.priorita) over (partition by mb.sequence_id) as prio_flusso
          from membri mb
         where mb.dominio !~* c_pec
           and not (mb.dominio = any(c_usa_e_getta))
           -- già in un flusso di questo brand, questo o un altro
           and not exists (select 1 from outreach_enrollments e
                             join outreach_sequences s2 on s2.id = e.sequence_id
                            where e.contact_id = mb.contact_id and s2.brand_id = v_brand.brand_id)
           -- chi usa il gestionale non riceve un cold
           and not exists (select 1 from profiles p
                            where p.company_id is not null and lower(btrim(p.email)) = lower(mb.email))
           and not exists (select 1 from companies co
                            where co.deleted_at is null and co.email like '%@%'
                              and lower(split_part(btrim(co.email), '@', 2)) = mb.dominio
                              and not (mb.dominio = any(c_gratuiti)))
           and not exists (select 1 from email_suppressions es
                            where es.company_id = c_piattaforma and es.email_normalized = lower(mb.email))
           and not exists (select 1 from outreach_mx_map mx
                            where mx.email_domain = mb.dominio and mx.mx_host is null
                              and mx.risolto_at > now() - interval '30 days')
           -- se l'azienda si conosce già: indirizzo chiuso, o azienda già scritta da questo brand
           and not exists (select 1 from outreach_prospect_contacts pc
                            where pc.contact_id = mb.contact_id
                              and (pc.stato in ('unsubscribed', 'bounced', 'negative')
                                   or exists (select 1 from outreach_prospect_contacts x
                                                join outreach_enrollments e on e.contact_id = x.contact_id
                                                join outreach_sequences s3 on s3.id = e.sequence_id
                                               where x.prospect_company_id = pc.prospect_company_id
                                                 and s3.brand_id = v_brand.brand_id)))
      )
      select * from idonei order by rango, prio_flusso, sequence_id
    loop
      exit when v_fatti >= p_max;
      v_motivo := null;

      v_az := outreach_ensure_prospect(v_c.contact_id);
      if v_az is null then
        v_motivo := 'senza_azienda';
      elsif exists (select 1 from outreach_prospect_contacts pc
                     where pc.contact_id = v_c.contact_id and pc.stato in ('unsubscribed', 'bounced', 'negative')) then
        v_motivo := 'indirizzo_chiuso';
      elsif exists (select 1 from outreach_prospect_companies pco
                      join outreach_suppression su
                        on (su.scope = 'company' and su.value = pco.company_key)
                        or (su.scope = 'domain' and pco.email_domain is not null and su.value = lower(pco.email_domain))
                     where pco.id = v_az) then
        v_motivo := 'azienda_esclusa';
      -- Un'azienda riceve da un brand su un indirizzo solo.
      elsif exists (select 1 from outreach_prospect_contacts pc
                      join outreach_enrollments e on e.contact_id = pc.contact_id
                      join outreach_sequences s on s.id = e.sequence_id
                     where pc.prospect_company_id = v_az and s.brand_id = v_brand.brand_id) then
        v_motivo := 'stessa_azienda';
      end if;

      if v_motivo is not null then
        v_saltati := jsonb_set(v_saltati, array[v_motivo], to_jsonb(coalesce((v_saltati ->> v_motivo)::int, 0) + 1));
        continue;
      end if;

      select st.step_order, st.subject, st.body into v_step
        from outreach_sequence_steps st
       where st.sequence_id = v_c.sequence_id and st.channel = 'email'
       order by st.step_order
       limit 1;

      v_orario := v_base + make_interval(secs => (v_n + (random() * 0.8 - 0.4)) * v_gap);

      v_enr := null;
      insert into outreach_enrollments (company_id, sequence_id, contact_id, status, current_step, next_action_at)
      values (c_piattaforma, v_c.sequence_id, v_c.contact_id, 'active', v_step.step_order, v_orario)
      on conflict (sequence_id, contact_id) do nothing
      returning id into v_enr;
      continue when v_enr is null;

      insert into outreach_send_queue (company_id, enrollment_id, contact_id, brand_id, channel, to_email,
                                       subject, body, status, scheduled_for, primo_contatto)
      values (c_piattaforma, v_enr, v_c.contact_id, v_brand.brand_id, 'email', v_c.email,
              coalesce(v_step.subject, ''), coalesce(v_step.body, ''), 'queued', v_orario, true);

      update outreach_prospect_contacts
         set stato = 'in_sequence', brand_corrente = v_brand.brand_id, updated_at = now()
       where contact_id = v_c.contact_id and stato in ('new', 'locked', 'cooldown');

      v_n := v_n + 1;
      v_fatti := v_fatti + 1;
      v_iscritti := jsonb_set(v_iscritti, array[v_c.sequence_id::text],
                              to_jsonb(coalesce((v_iscritti ->> v_c.sequence_id::text)::int, 0) + 1));
    end loop;
  end loop;

  return jsonb_build_object('totale', v_fatti, 'iscritti', v_iscritti, 'saltati', v_saltati);
end;
$function$;

revoke all on function public.outreach_arruola_liste(timestamptz, integer) from public, anon, authenticated;
