create table private.documento_email_richieste (
  company_id uuid not null references public.companies(id) on delete cascade,
  documento_id uuid not null references public.documenti_fiscali(id) on delete cascade,
  richiesta_id uuid not null,
  impronta text not null,
  stato text not null check (stato in ('in_corso','inviato','rifiutato','incerto')),
  esito jsonb,
  aggiornato_il timestamptz not null default now(),
  primary key(company_id, documento_id, richiesta_id)
);
alter table private.documento_email_richieste enable row level security;
revoke all on private.documento_email_richieste from public, anon, authenticated;
grant select, insert, update on private.documento_email_richieste to service_role;

alter table public.billing_sync_log add column documento_fiscale_id uuid
  references public.documenti_fiscali(id) on delete set null;
create index billing_sync_log_documento_fiscale_idx on public.billing_sync_log(documento_fiscale_id)
  where documento_fiscale_id is not null;

create index email_delivery_log_documento_idx
  on public.email_delivery_log (company_id, (metadata->>'documento_id'))
  where template_type = 'documento_send' and status in ('sent','delivered','bounced');

create index email_delivery_log_documento_richiesta_idx
  on public.email_delivery_log (company_id, (metadata->>'documento_email_request_id'))
  where template_type = 'documento_send';

create function public.documento_email_richiesta(
  p_azienda uuid, p_documento uuid, p_richiesta uuid, p_impronta text, p_esito jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r private.documento_email_richieste;
  v_esito jsonb;
begin
  if p_esito is not null then
    update private.documento_email_richieste
      set stato = p_esito->>'stato', esito = p_esito, aggiornato_il = now()
      where company_id = p_azienda and documento_id = p_documento and richiesta_id = p_richiesta
        and impronta = p_impronta and stato = 'in_corso';
    return p_esito;
  end if;

  insert into private.documento_email_richieste(company_id, documento_id, richiesta_id, impronta, stato)
    values (p_azienda, p_documento, p_richiesta, p_impronta, 'in_corso')
    on conflict do nothing;
  if found then return jsonb_build_object('stato','inoltra'); end if;

  select * into strict r from private.documento_email_richieste
    where company_id = p_azienda and documento_id = p_documento and richiesta_id = p_richiesta
    for update;
  if r.impronta is distinct from p_impronta then
    return jsonb_build_object('stato','diversa');
  end if;
  if r.stato = 'inviato' then return r.esito; end if;

  select jsonb_build_object(
    'stato','inviato','success',true,'over_quota',coalesce(l.metadata->'over_quota','false'::jsonb),
    'charged_eur',coalesce(l.charged_eur,0),'is_free',coalesce(l.metadata->'is_free','false'::jsonb)
  ) into v_esito from public.email_delivery_log l
    where l.company_id = p_azienda and l.template_type = 'documento_send'
      and l.metadata->>'documento_id' = p_documento::text
      and l.metadata->>'documento_email_request_id' = p_richiesta::text
      and l.status in ('sent','delivered','bounced')
    order by l.sent_at desc limit 1;
  if found then
    update private.documento_email_richieste set stato = 'inviato', esito = v_esito, aggiornato_il = now()
      where company_id = p_azienda and documento_id = p_documento and richiesta_id = p_richiesta;
    return v_esito;
  end if;

  if r.stato = 'rifiutato' then
    update private.documento_email_richieste set stato = 'in_corso', esito = null, aggiornato_il = now()
      where company_id = p_azienda and documento_id = p_documento and richiesta_id = p_richiesta;
    return jsonb_build_object('stato','inoltra');
  end if;
  return jsonb_build_object('stato', case
    when r.stato = 'in_corso' and r.aggiornato_il > now() - interval '2 minutes' then 'in_corso'
    else 'incerto'
  end);
end;
$$;
revoke all on function public.documento_email_richiesta(uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.documento_email_richiesta(uuid,uuid,uuid,text,jsonb) to service_role;


-- Il registro tecnico delle vecchie fatture punta a invoices. Il log di
-- consegna resta valido anche se la scrittura nel registro tecnico fallisce.
do $$
declare
  v_def text := pg_get_functiondef('public.documenti_fiscali_proteggi_emessi()'::regprocedure);
  v_attuale text := $cond$    AND NOT EXISTS (SELECT 1 FROM public.billing_sync_log l
                     WHERE l.invoice_id = OLD.id AND l.provider = 'email'
                       AND l.status = 'success');$cond$;
  v_nuovo text := $cond$    AND NOT EXISTS (SELECT 1 FROM public.billing_sync_log l
                     WHERE l.company_id = OLD.company_id AND l.provider = 'email' AND l.status = 'success'
                       AND (l.documento_fiscale_id = OLD.id OR l.invoice_id = OLD.id))
    AND NOT EXISTS (SELECT 1 FROM public.email_delivery_log l
                     WHERE l.company_id = OLD.company_id AND l.template_type = 'documento_send'
                       AND l.metadata->>'documento_id' = OLD.id::text
                       AND l.status IN ('sent','delivered','bounced'))
    AND NOT EXISTS (SELECT 1 FROM private.documento_email_richieste r
                     WHERE r.company_id = OLD.company_id AND r.documento_id = OLD.id AND r.stato = 'inviato');$cond$;
begin
  if position(v_attuale in v_def) = 0 then
    raise exception 'Condizione email mancante nella protezione dei documenti emessi';
  end if;
  execute replace(v_def, v_attuale, v_nuovo);
end;
$$;
