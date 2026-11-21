-- Il pubblico da mostrare e quello da confermare usano gli stessi dati.
create or replace function public.outreach_pubblico_avvio(p_company uuid,p_sequence uuid)
returns table (
  id uuid, enrollment_id uuid, contact_id uuid, channel text, kind text,
  scheduled_for timestamptz, primo_contatto boolean, motivo text
)
language sql stable security invoker set search_path = '' as $$
  with righe as (
    select q.id,e.id enrollment_id,e.contact_id,q.channel,q.kind,q.scheduled_for,q.primo_contatto,
      case
        when e.status='paused' and e.stop_reason is distinct from 'attesa_attivazione' then 'Iscrizione in pausa'
        when e.status not in ('active','paused') then 'Iscrizione terminata'
        when c.id is null or c.deleted_at is not null then 'Contatto assente o nel cestino'
        when coalesce(c.unsubscribed,false) or coalesce(c.opt_out,false) then 'Contatto disiscritto'
        when c.ricontatta_dopo>now() then 'Contatto in attesa'
        when q.brand_id is distinct from s.brand_id then 'Brand della coda diverso da quello della sequenza'
        when q.scheduled_for is null then 'Data di invio assente'
        when q.kind='send' and q.channel='email' and (
          coalesce(c.optout_email,false) or exists(select 1 from public.email_suppressions b
            where b.company_id=s.company_id and b.email_normalized=lower(btrim(q.to_email)))
        ) then 'Email esclusa o in blocklist'
        when q.kind='send' and q.channel='email' and (
          nullif(btrim(q.to_email),'') is null or lower(btrim(c.email)) is distinct from lower(btrim(q.to_email))
        ) then 'Recapito email cambiato o assente'
        when q.kind='send' and q.channel='email'
          and (nullif(btrim(q.subject),'') is null or nullif(btrim(q.body),'') is null)
          then 'Email in coda senza oggetto o testo'
        when q.kind='send' and q.channel in ('sms','whatsapp','call') and (
          (q.channel='sms' and coalesce(c.optout_sms,false))
          or (q.channel='whatsapp' and coalesce(c.optout_whatsapp,false))
          or (q.channel='call' and coalesce(c.optout_call,false))
        ) then 'Canale escluso dal contatto'
        when q.kind='send' and q.channel in ('sms','whatsapp','call') and (
          public.outreach_telefono_csv(q.to_phone) is null
          or public.outreach_telefono_csv(q.to_phone) is distinct from public.outreach_telefono_csv(c.phone)
        ) then 'Numero cambiato o assente'
      end motivo
    from public.outreach_sequences s
    join public.outreach_enrollments e on e.sequence_id=s.id and e.company_id=s.company_id
    join public.outreach_send_queue q on q.enrollment_id=e.id and q.company_id=s.company_id and q.status='queued'
    left join public.marketing_contacts c on c.id=e.contact_id and c.company_id=s.company_id
    where s.id=p_sequence and s.company_id=p_company
      and p_company='00000000-0000-0000-0000-000000000001'
  )
  select id,enrollment_id,contact_id,channel,kind,scheduled_for,primo_contatto,
    max(motivo) over (partition by enrollment_id) motivo
  from righe;
$$;

create or replace function public.outreach_anteprima_avvio(p_company uuid,p_sequence uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  s public.outreach_sequences%rowtype;
  b public.outreach_brands%rowtype;
  caselle jsonb;
  identita_caselle text;
  step_validi boolean;
  pubblico jsonb;
  versione text;
  motivo text;
begin
  if p_company is distinct from '00000000-0000-0000-0000-000000000001'::uuid or auth.uid() is null
     or not public.is_super_admin() or public.utente_bloccato() then
    raise exception 'Accesso alla console marketing negato' using errcode = '42501';
  end if;
  select * into s from public.outreach_sequences where company_id=p_company and id=p_sequence;
  if not found then raise exception 'Sequenza non disponibile'; end if;
  select * into b from public.outreach_brands where company_id=p_company and id=s.brand_id;
  select coalesce((select nullif(btrim(x.body),'') is not null and nullif(btrim(x.subject),'') is not null
    from public.outreach_sequence_steps x where x.sequence_id=s.id and x.channel='email'
    order by x.step_order limit 1),false) into step_validi;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'email',a.email,'provider',a.provider,'status',a.status,'tetto',a.daily_cap_target,
      'base',a.warmup_base,'passo',a.warmup_step,'giorno',a.warmup_day,
      'daily_sent',a.daily_sent,'daily_sent_date',a.daily_sent_date,
      'primi_oggi',(select count(*) from public.outreach_send_queue q
        where q.company_id=p_company and q.sender_account_id=a.id and q.status='sent'
          and q.primo_contatto and q.sent_at>=date_trunc('day',now(),'UTC'))
    ) order by a.email),'[]'),
    string_agg(concat_ws('|',a.id,a.email,a.provider,a.status,a.daily_cap_target,a.warmup_base,
      a.warmup_step,a.warmup_day),',' order by a.id)
  into caselle,identita_caselle
  from public.outreach_sender_accounts a
  where a.company_id=p_company and a.brand_id=b.id and exists(
    select 1 from public.v_outreach_infrastruttura v where v.brand_id=b.id and v.casella_id=a.id and v.pronta
  );

  with righe as materialized (select * from public.outreach_pubblico_avvio(p_company,p_sequence)),
  cause as (
    select r.motivo,count(distinct contact_id) n from righe r where r.motivo is not null group by r.motivo
  )
  select jsonb_build_object(
      'destinatari',count(distinct r.contact_id) filter(where r.motivo is null and r.kind='send' and r.channel<>'call'),
      'invii',count(*) filter(where r.motivo is null and r.kind='send' and r.channel<>'call'),
      'email',count(*) filter(where r.motivo is null and r.kind='send' and r.channel='email'),
      'primi_email',count(*) filter(where r.motivo is null and r.kind='send' and r.channel='email' and primo_contatto),
      'arretrati_email',count(*) filter(where r.motivo is null and r.kind='send' and r.channel='email' and scheduled_for<=now()),
      'arretrati_primi',count(*) filter(where r.motivo is null and r.kind='send' and r.channel='email' and primo_contatto and scheduled_for<=now()),
      'prima_email',min(scheduled_for) filter(where r.motivo is null and r.kind='send' and r.channel='email'),
      'altri_canali',count(*) filter(where r.motivo is null and r.kind='send' and r.channel in ('sms','whatsapp')),
      'chiamate',count(*) filter(where r.motivo is null and r.kind='send' and r.channel='call'),
      'esclusi',count(distinct r.contact_id) filter(where r.motivo is not null),
      'cause',coalesce((select jsonb_object_agg(c.motivo,c.n) from cause c),'{}')
    ),
    md5(concat_ws('|',s.id,s.status,s.updated_at,b.id,b.updated_at,identita_caselle,
      string_agg(concat_ws('|',id,enrollment_id,scheduled_for,channel,kind,primo_contatto,r.motivo),',' order by id)))
  into pubblico,versione from righe r;

  motivo := case
    when s.status='active' then 'La sequenza è già attiva.'
    when b.id is null then 'Assegna un brand alla sequenza.'
    when b.status<>'active' then 'Il brand è in pausa o archiviato.'
    when not step_validi then 'Completa il primo passaggio email con oggetto e testo.'
    when jsonb_array_length(caselle)=0 then 'Il brand non ha caselle email pronte.'
  end;
  return pubblico || jsonb_build_object(
    'versione',versione,'blocco',motivo,'stato',s.status,'brand',b.name,'mittente',b.from_name,
    'risposte_a',b.reply_to,'nuovi_per_casella',b.new_per_day,'finestra',b.send_window,
    'caselle',caselle,'calcolato_il',now()
  );
end
$$;

create or replace function public.outreach_conferma_avvio(p_company uuid,p_sequence uuid,p_versione text)
returns void language plpgsql volatile security invoker set search_path = '' as $$
declare
  anteprima jsonb;
begin
  if p_company is distinct from '00000000-0000-0000-0000-000000000001'::uuid or auth.uid() is null
     or not public.is_super_admin() or public.utente_bloccato() then
    raise exception 'Accesso alla console marketing negato' using errcode = '42501';
  end if;
  perform 1 from public.outreach_sequences where company_id=p_company and id=p_sequence for update;
  anteprima := public.outreach_anteprima_avvio(p_company,p_sequence);
  if p_versione is null or anteprima->>'versione' is distinct from p_versione then
    raise exception 'Il pubblico o la configurazione sono cambiati. Aggiorna l’anteprima e verifica i dati.';
  end if;
  if anteprima->>'blocco' is not null then raise exception '%',anteprima->>'blocco'; end if;

  with verificati as materialized (
    select enrollment_id,bool_or(motivo is not null) escluso
    from public.outreach_pubblico_avvio(p_company,p_sequence) group by enrollment_id
  )
  update public.outreach_enrollments e
    set status=case when v.escluso then 'paused' else 'active' end,
        stop_reason=case when v.escluso then 'destinatario_da_verificare' else null end
  from verificati v where v.enrollment_id=e.id and e.company_id=p_company and e.sequence_id=p_sequence
    and ((e.status='active' and v.escluso) or (e.status='paused' and e.stop_reason='attesa_attivazione'));

  update public.outreach_sequences set status='active' where company_id=p_company and id=p_sequence;
end
$$;

revoke all on function public.outreach_pubblico_avvio(uuid,uuid),public.outreach_anteprima_avvio(uuid,uuid),
  public.outreach_conferma_avvio(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.outreach_pubblico_avvio(uuid,uuid),public.outreach_anteprima_avvio(uuid,uuid),
  public.outreach_conferma_avvio(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';

-- I pass SMS, WhatsApp, chiamata e avanzamento rispettano lo stato della
-- sequenza e del brand prima di prendere righe in coda.
create or replace function public.outreach_coda_multicanale(p_kind text,p_channels text[],p_limit integer)
returns setof public.outreach_send_queue
language sql stable security invoker set search_path = '' as $$
  select q.*
  from public.outreach_send_queue q
  left join public.outreach_enrollments e on e.id=q.enrollment_id and e.company_id=q.company_id
  left join public.outreach_sequences s on s.id=e.sequence_id and s.company_id=q.company_id
  left join public.outreach_brands b on b.id=coalesce(q.brand_id,s.brand_id) and b.company_id=q.company_id
  where q.status='queued' and q.kind=p_kind
    and (p_channels is null or q.channel=any(p_channels))
    and q.scheduled_for<=now()
    and (q.enrollment_id is null or (s.status='active' and e.status<>'paused'))
    and (coalesce(q.brand_id,s.brand_id) is null or b.status='active')
  order by q.scheduled_for,q.id
  limit greatest(1,least(coalesce(p_limit,1),1000));
$$;
revoke all on function public.outreach_coda_multicanale(text,text[],integer) from public,anon,authenticated;
grant execute on function public.outreach_coda_multicanale(text,text[],integer) to service_role;
notify pgrst,'reload schema';
